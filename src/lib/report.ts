// Pure helpers that join an extraction with its score and its citations.

import { fold } from '@/shared/score'

import type { Citation, LabResultRow, RowScore, Score } from '@/shared/contract'

export type RowState =
  | 'ok' // name, value, flag, units and range match the source
  | 'value' // the value differs
  | 'detail' // the value matches, the name, flag, units or range differ
  | 'extra' // the row has no match in the source
  | 'unscored' // the sample has no ground truth

export interface RowCheck {
  state: RowState
  score: RowScore | null
}

/** Finds the score of each extracted row. Each score names the extracted row it matched. */
export function alignRows(
  rows: LabResultRow[],
  score: Score | null,
): { checks: RowCheck[]; missed: RowScore[] } {
  if (!score) return { checks: rows.map(() => ({ state: 'unscored', score: null })), missed: [] }
  const checks: RowCheck[] = rows.map(() => ({ state: 'extra', score: null }))
  const missed: RowScore[] = []
  for (const s of score.perRow) {
    if (!s.found) {
      missed.push(s)
      continue
    }
    const detailOk = s.nameOk && s.flagOk && s.unitsOk && s.referenceOk
    checks[s.found.index] = { state: !s.valueOk ? 'value' : detailOk ? 'ok' : 'detail', score: s }
  }
  return { checks, missed }
}

export type Box = NonNullable<Citation['bbox']> & { page: number }

/** The distinct boxes of a list of citations. page is 0-based. */
export function boxesOf(citations: Citation[] | undefined): Box[] {
  const seen = new Set<string>()
  const out: Box[] = []
  for (const c of citations ?? []) {
    if (!c.bbox) continue
    const page = c.page ?? 0
    const key = [page, ...[c.bbox.x, c.bbox.y, c.bbox.width, c.bbox.height].map((n) => n.toFixed(3))].join()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...c.bbox, page })
  }
  return out
}

/** How far a box of a row can be trusted. */
export type RowBasis =
  | 'named' // the citation text of this table names the row
  | 'nearby' // the citation text names a row next to it, in the same run of rows
  | 'general' // no citation text names any row
  | 'none' // other rows are named, but no citation reaches this one

export interface RowCitation {
  boxes: Box[]
  basis: RowBasis
}

/** A box shorter than this is a heading or a caption, not a table. */
const MIN_TABLE_HEIGHT = 0.03

function namesRow(text: string, name: string): boolean {
  const escaped = fold(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(text)
}

/**
 * Boxes for each result row. The API cites tables, not rows, and cuts the citation text at
 * 500 characters, so a text names only the first rows of its table. Rows come in page order,
 * so a row the text does not name belongs to the same table as the last named row. A row above
 * the first named row has no citation.
 */
export function rowCitations(citations: Citation[] | undefined, rows: LabResultRow[]): RowCitation[] {
  const all = (citations ?? []).filter((c) => c.bbox)
  const tall = all.filter((c) => c.bbox!.height >= MIN_TABLE_HEIGHT)
  const tables = tall.length ? tall : all
  const general: RowCitation = { boxes: boxesOf(tables), basis: 'general' }
  const texts = tables.map((c) => fold(cleanCitationText(c.text)))

  let current = -1
  const picks = rows.map((row) => {
    const name = row.test_name?.trim()
    const hits = name ? texts.flatMap((t, i) => (namesRow(t, name) ? [i] : [])) : []
    if (!hits.length) return { table: current, named: false }
    current = hits.find((i) => i >= current) ?? hits[0]!
    return { table: current, named: true }
  })
  if (current < 0) return rows.map(() => general)
  return picks.map((p) =>
    p.table < 0
      ? { boxes: [], basis: 'none' }
      : { boxes: boxesOf([tables[p.table]!]), basis: p.named ? 'named' : 'nearby' },
  )
}

/** Citation text without table markup, for display. */
export function cleanCitationText(text: string | undefined): string {
  return (text ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(?:table|thead|tbody|tr|td|th)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
