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

import type { FieldKey, FieldScore, LabReport, LabResultRow, RowScore, Score } from './contract'

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
export const normUnits = (s: string | null | undefined) => (s ? fold(s).replace(/\s+/g, '').replace(/,/g, '.') : '')
export const normFlag = (s: string | null | undefined) => (s ? fold(s).replace(/\s+/g, '') : '')

export function normValue(s: string | null | undefined): string {
  return s ? fold(s).replace(/\s+/g, '').replace(/,/g, '.') : ''
}

/** A plain decimal only: Number() also reads "0x10" and "1e3". */
const DECIMAL = /^-?\d+(?:\.\d+)?$/

// A decimal comma is the convention on these reports, so "1,234" reads as 1.234.
export function sameValue(expected: string, found: string | null | undefined): boolean {
  const a = normValue(expected)
  const b = normValue(found)
  if (a === b) return true
  return DECIMAL.test(a) && DECIMAL.test(b) && Number(a) === Number(b)
}

const normRange = (s: string | null | undefined) => normValue(s).replace(/−/g, '-')

/** The range as printed. The extraction can leave the units inside it, and that is not an error. */
export function sameRange(expected: string | null, units: string | null, found: string | null | undefined): boolean {
  const a = normRange(expected)
  const b = normRange(found)
  return a === b || (a !== '' && b === a + normUnits(units))
}

/** Levenshtein distance, for test names with an OCR typo ("Cholestéro total"). */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]!
}

/** Names this short are too close to each other to match loosely: RBC and WBC, ALT and AST. */
const MIN_LOOSE = 4

/**
 * Pairs ground-truth rows with extracted rows. Returns, per truth row, the extracted index or -1.
 * Every exact name is claimed first, so a loose match can never take the exact row of another test.
 * Then contained names, then small edit distances. Last, a gap between two matched rows that holds
 * the same number of rows on both sides pairs by position, when the value matches or the name
 * is at least half right: the OCR misread those names.
 */
function pairRows(truth: TruthRow[], rows: LabResultRow[]): number[] {
  const keys = truth.map((t) => normName(t.test))
  const names = rows.map((r) => normName(r.test_name ?? ''))
  const pairs = truth.map(() => -1)
  const used = new Set<number>()
  const pass = (matches: (name: string, key: string) => boolean) => {
    keys.forEach((key, i) => {
      if (pairs[i]! >= 0) return
      const j = names.findIndex((n, idx) => !used.has(idx) && matches(n, key))
      if (j >= 0) {
        pairs[i] = j
        used.add(j)
      }
    })
  }
  pass((n, key) => n === key)
  pass((n, key) => n.length >= MIN_LOOSE && key.length >= MIN_LOOSE && (n.includes(key) || key.includes(n)))
  pass(
    (n, key) =>
      n.length >= MIN_LOOSE &&
      key.length >= MIN_LOOSE &&
      editDistance(n, key) <= Math.max(1, Math.floor(key.length * 0.2)),
  )

  for (let i = 0; i < truth.length; i++) {
    if (pairs[i]! >= 0) continue
    let end = i
    while (end + 1 < truth.length && pairs[end + 1]! < 0) end++
    const lo = i > 0 ? pairs[i - 1]! : -1
    const hi = end + 1 < truth.length ? pairs[end + 1]! : rows.length
    const free: number[] = []
    for (let j = lo + 1; j < hi; j++) if (!used.has(j)) free.push(j)
    if (free.length === end - i + 1) {
      free.forEach((j, k) => {
        const t = truth[i + k]!
        const close = editDistance(names[j]!, keys[i + k]!) <= keys[i + k]!.length / 2
        if (!close && !sameValue(t.value, rows[j]!.value)) return
        pairs[i + k] = j
        used.add(j)
      })
    }
    i = end
  }
  return pairs
}

/** Compare the ground-truth rows with the extracted rows. */
export function score(truth: TruthRow[], extracted: LabResultRow[] | null | undefined): Score {
  const rows = (extracted ?? []).filter((r) => r && (r.test_name || r.value))
  const pairs = pairRows(truth, rows)
  const used = new Set(pairs.filter((j) => j >= 0))

  const perRow: RowScore[] = truth.map((t, i) => {
    const idx = pairs[i]!
    const r = idx >= 0 ? rows[idx]! : null
    const expected = { value: t.value, flag: t.flag, units: t.units, reference: t.reference }
    if (!r) {
      return {
        test: t.test,
        expected,
        found: null,
        nameOk: false,
        valueOk: false,
        flagOk: false,
        unitsOk: false,
        referenceOk: false,
      }
    }
    return {
      test: t.test,
      expected,
      found: {
        index: idx,
        test: r.test_name,
        value: r.value,
        flag: r.flag,
        units: r.units,
        reference: r.reference_text,
      },
      nameOk: normName(r.test_name ?? '') === normName(t.test),
      valueOk: sameValue(t.value, r.value),
      flagOk: normFlag(t.flag) === normFlag(r.flag),
      unitsOk: normUnits(t.units) === normUnits(r.units),
      referenceOk: sameRange(t.reference, t.units, r.reference_text),
    }
  })

  return {
    rowsExpected: truth.length,
    rowsFound: perRow.filter((r) => r.found).length,
    rowsExtracted: rows.length,
    namesCorrect: perRow.filter((r) => r.nameOk).length,
    valuesCorrect: perRow.filter((r) => r.valueOk).length,
    flagsCorrect: perRow.filter((r) => r.flagOk).length,
    unitsCorrect: perRow.filter((r) => r.unitsOk).length,
    referencesCorrect: perRow.filter((r) => r.referenceOk).length,
    perRow,
    extraRows: rows.filter((_, j) => !used.has(j)).map((r) => r.test_name ?? '(no name)'),
    fields: [],
  }
}

/** "FINAL / FINAL" -> final. Anything else, such as the page title, is not a status. */
export function normStatus(s: string | null | undefined): 'final' | 'preliminary' | 'amended' | null {
  const t = fold(s ?? '')
  if (/\bfinal/.test(t)) return 'final'
  if (/prelim|partial|partiel/.test(t)) return 'preliminary'
  if (/amend|modifi|corrig/.test(t)) return 'amended'
  return null
}

const FIELD_LABELS: Array<[FieldKey, RegExp]> = [
  ['patient_name', /^patient/i],
  ['health_insurance_number', /health ins|ass\. maladie/i],
  ['date_of_birth', /date of birth|date de naissance/i],
  ['sex', /^(sex|sexe)\b/i],
  ['ordering_physician', /ordering physician|médecin requérant/i],
  ['collected_at', /collected|prélevé/i],
  ['reported_at', /reported|rapport émis/i],
]

/** The header fields printed on the page, from "Label : **value**" lines of the page markdown. */
export function parseTruthFields(pageMd: string): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {}
  const lines = pageMd.split('\n')
  const lab = lines.find((l) => /^\*\*[^*]+\*\*\s*$/.test(l))
  if (lab) out.lab_name = lab.replace(/\*/g, '').trim()
  for (const line of lines) {
    const m = /^(.+?)\s*:\s*\*\*(.+?)\*\*\s*$/.exec(line)
    if (!m) continue
    const hit = FIELD_LABELS.find(([, re]) => re.test(m[1]!))
    if (hit && !out[hit[0]]) out[hit[0]] = m[2]!.trim()
  }
  const title = lines.find((l) => l.startsWith('# '))
  const status = title?.includes('—') ? normStatus(title.split('—').pop()) : null
  if (status) out.report_status = status
  return out
}

const normField = (s: string) => normName(s.replace(/(\d)T(\d)/g, '$1 $2'))

/** Compares the patient and report fields with the page. A field the page does not print is not counted. */
export function scoreFields(pageMd: string, value: LabReport | null | undefined): FieldScore[] {
  const truth = parseTruthFields(pageMd)
  return (Object.entries(truth) as Array<[FieldKey, string]>).map(([key, expected]) => {
    const raw = value?.[key]
    const found = typeof raw === 'string' && raw.trim() ? raw.trim() : null
    const ok =
      key === 'report_status'
        ? normStatus(found) === expected
        : found !== null && normField(found) === normField(expected)
    return { key, expected, found, ok }
  })
}

/** The full score of a lab report page. Null when the page has no results table. */
export function scoreReport(pageMd: string, value: LabReport | null | undefined): Score | null {
  const truth = parseTruth(pageMd)
  if (!truth.length) return null
  return { ...score(truth, value?.results), fields: scoreFields(pageMd, value) }
}
