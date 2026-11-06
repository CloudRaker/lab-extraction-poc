// Pure helpers that join an extraction with its score and its citations.

import type { Citation, LabResultRow, RowScore, Score } from '@/shared/contract'

export type RowState =
  | 'ok' // value, flag and units match the source
  | 'value' // the value differs
  | 'detail' // the value matches, the flag or the units differ
  | 'extra' // the row has no match in the source
  | 'unscored' // the sample has no ground truth

export interface RowCheck {
  state: RowState
  score: RowScore | null
}

/**
 * Finds the score of each extracted row. perRow is in ground-truth order and names
 * the extracted row it matched, so walk it and claim the first unused row with that name.
 */
export function alignRows(
  rows: LabResultRow[],
  score: Score | null,
): { checks: RowCheck[]; missed: RowScore[] } {
  if (!score) return { checks: rows.map(() => ({ state: 'unscored', score: null })), missed: [] }
  const checks: RowCheck[] = rows.map(() => ({ state: 'extra', score: null }))
  const missed: RowScore[] = []
  const used = new Set<number>()
  for (const s of score.perRow) {
    if (!s.found) {
      missed.push(s)
      continue
    }
    const i = rows.findIndex(
      (r, idx) => !used.has(idx) && r.test_name === s.found?.test && r.value === s.found?.value,
    )
    const j = i >= 0 ? i : rows.findIndex((r, idx) => !used.has(idx) && r.test_name === s.found?.test)
    if (j < 0) {
      missed.push(s)
      continue
    }
    used.add(j)
    checks[j] = { state: !s.valueOk ? 'value' : s.flagOk && s.unitsOk ? 'ok' : 'detail', score: s }
  }
  return { checks, missed }
}

export type Box = NonNullable<Citation['bbox']>

/** The distinct boxes of a list of citations, on the first page. */
export function boxesOf(citations: Citation[] | undefined): Box[] {
  const seen = new Set<string>()
  const out: Box[] = []
  for (const c of citations ?? []) {
    if (!c.bbox || (c.page ?? 0) !== 0) continue
    const key = [c.bbox.x, c.bbox.y, c.bbox.width, c.bbox.height].map((n) => n.toFixed(3)).join()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c.bbox)
  }
  return out
}

/**
 * Boxes for one result row. The API cites tables, not rows: "results" holds table
 * boxes, and some citation texts name the row. Use those when they exist, so the box
 * is the table that holds this row. Otherwise show every table box.
 */
export function rowBoxes(citations: Citation[] | undefined, testName: string | null): Box[] {
  const name = testName?.toLowerCase()
  const named = name ? citations?.filter((c) => c.text?.toLowerCase().includes(name)) : undefined
  const boxes = boxesOf(named)
  return boxes.length ? boxes : boxesOf(citations)
}

/** Citation text without table markup, for display. */
export function cleanCitationText(text: string | undefined): string {
  return (text ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
