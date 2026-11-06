// Ground-truth scoring. Pure: no I/O, runs in the worker, the browser, the
// script and the tests.
//
// The synthdocs JSON of each page carries `page_md`, the exact markdown of the
// page. Its results tables come in a few layouts:
//   | Test | Result | Flag | Units | Reference range |
//   | Analysis | Result | Abn. | Reference interval / units | Comment |   (units inside the interval)
//   | Test | Result | Flag | Previous results |  | Units | Reference range |
// Section rows have only the first cell filled. Previous-results tables open
// with a row of dates and an empty first cell.

import type { LabResultRow, RowScore, Score } from './contract'

export interface TruthRow {
  section: string | null
  test: string
  value: string
  flag: string | null
  units: string | null
  reference: string | null
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

const isTableRow = (line: string) => line.trim().startsWith('|')
const isSeparator = (line: string) => /^\|\s*-{3,}/.test(line.trim())

interface Columns {
  test: number
  result: number
  flag: number
  units: number // -1 when units live inside the reference column
  reference: number
}

function columnsOf(header: string[]): Columns | null {
  const find = (re: RegExp, not?: RegExp) =>
    header.findIndex((h) => re.test(h) && !(not && not.test(h)))
  const result = find(/result|résultat/i, /previous|antérieur/i)
  const flag = find(/flag|ind\.|abn|anorm/i)
  const reference = find(/reference|référence|interval/i)
  const units = find(/units?|unités?/i, /reference|référence|interval/i)
  if (result < 0) return null
  return { test: 0, result, flag, units, reference }
}

// "135 – 145 mmol/L" -> "mmol/L"; "> 60 mL/min/1,73m²" -> "mL/min/1,73m²"; "Negative" -> null
const INTERVAL = /^\s*(?:[<>≤≥]=?\s*)?\d[\d.,]*(?:\s*[\u2013\u2014-]\s*\d[\d.,]*)?\s*(.*)$/
export function unitsFromInterval(text: string): { units: string | null; reference: string } {
  const m = INTERVAL.exec(text)
  if (!m) return { units: null, reference: text }
  const units = m[1]!.trim()
  return { units: units || null, reference: text.slice(0, text.length - m[1]!.length).trim() }
}

/** Parse every results row from the synthdocs page markdown. */
export function parseTruth(pageMd: string): TruthRow[] {
  const lines = pageMd.split('\n')
  const rows: TruthRow[] = []
  let section: string | null = null
  let cols: Columns | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!isTableRow(line)) {
      cols = null
      continue
    }
    if (isSeparator(line)) continue
    if (cols === null) {
      // First row of a table is its header, if a separator follows.
      if (lines[i + 1] && isSeparator(lines[i + 1]!)) cols = columnsOf(cells(line))
      continue
    }
    const c = cells(line)
    const test = c[cols.test] ?? ''
    const others = c.filter((_, j) => j !== cols!.test)
    if (!test) continue // date row of a previous-results table
    if (others.every((x) => !x)) {
      section = test
      continue
    }
    const value = c[cols.result] ?? ''
    if (!value) continue
    const flag = cols.flag >= 0 ? c[cols.flag] || null : null
    let units: string | null = null
    let reference: string | null = cols.reference >= 0 ? c[cols.reference] || null : null
    if (cols.units >= 0) units = c[cols.units] || null
    else if (reference) ({ units, reference } = unitsFromInterval(reference))
    rows.push({ section, test, value, flag, units, reference })
  }
  return rows
}

const stripAccents = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Unicode-fold: µ/μ, ², ㎡, <sup>, ^ all compare equal. */
export function fold(s: string): string {
  return stripAccents(
    s
      .replace(/<\/?sup>/gi, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .normalize('NFKC'),
  )
    .toLowerCase()
    .replace(/\^/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export const normName = (s: string) => fold(s).replace(/[^a-z0-9]+/g, '')
export const normUnits = (s: string | null | undefined) => (s ? fold(s).replace(/\s+/g, '') : '')
export const normFlag = (s: string | null | undefined) => (s ? fold(s).replace(/\s+/g, '') : '')

export function normValue(s: string | null | undefined): string {
  return s ? fold(s).replace(/\s+/g, '').replace(/,/g, '.') : ''
}

export function sameValue(expected: string, found: string | null | undefined): boolean {
  const a = normValue(expected)
  const b = normValue(found)
  if (a === b) return true
  const na = Number(a)
  const nb = Number(b)
  return a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb) && na === nb
}

/** Match ground-truth rows to extracted rows by normalized test name, in page order. */
export function score(truth: TruthRow[], extracted: LabResultRow[] | null | undefined): Score {
  const rows = (extracted ?? []).filter((r) => r && (r.test_name || r.value))
  const used = new Set<number>()
  const pick = (test: string): number => {
    const key = normName(test)
    let idx = rows.findIndex((r, j) => !used.has(j) && normName(r.test_name ?? '') === key)
    if (idx < 0) {
      // Loose match: one name contains the other ("Glucose" vs "Glucose (fasting)").
      idx = rows.findIndex((r, j) => {
        const n = normName(r.test_name ?? '')
        return !used.has(j) && n.length > 2 && (n.includes(key) || key.includes(n))
      })
    }
    if (idx >= 0) used.add(idx)
    return idx
  }

  const perRow: RowScore[] = truth.map((t) => {
    const idx = pick(t.test)
    const r = idx >= 0 ? rows[idx]! : null
    const expected = { value: t.value, flag: t.flag, units: t.units }
    if (!r) return { test: t.test, expected, found: null, valueOk: false, flagOk: false, unitsOk: false }
    return {
      test: t.test,
      expected,
      found: { value: r.value, flag: r.flag, units: r.units },
      valueOk: sameValue(t.value, r.value),
      flagOk: normFlag(t.flag) === normFlag(r.flag),
      unitsOk: normUnits(t.units) === normUnits(r.units),
    }
  })

  return {
    rowsExpected: truth.length,
    rowsFound: perRow.filter((r) => r.found).length,
    rowsExtracted: rows.length,
    valuesCorrect: perRow.filter((r) => r.valueOk).length,
    flagsCorrect: perRow.filter((r) => r.flagOk).length,
    unitsCorrect: perRow.filter((r) => r.unitsOk).length,
    perRow,
    extraRows: rows.filter((_, j) => !used.has(j)).map((r) => r.test_name ?? '(no name)'),
  }
}
