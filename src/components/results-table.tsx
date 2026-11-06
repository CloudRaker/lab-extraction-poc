import { Check, CircleAlert, TriangleAlert, X } from 'lucide-react'
import { Fragment } from 'react'

import { Badge } from '@/components/arc/badge/badge'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import { flagInfo } from '@/lib/format'
import { alignRows, rowCitations, type RowBasis, type RowCheck, type RowCitation } from '@/lib/report'

import type { Citation, LabResultRow, RowScore, Score } from '@/shared/contract'
import type { Highlight } from './page-viewer'

/** What differs from the source, one sentence each. Empty when the row matches. */
function differences(s: RowScore): Array<{ text: string; tone: 'danger' | 'warning' }> {
  const e = s.expected
  const out: Array<{ text: string; tone: 'danger' | 'warning' }> = []
  if (!s.valueOk) out.push({ text: `Value in the source: ${e.value}.`, tone: 'danger' })
  if (!s.nameOk) out.push({ text: `Name in the source: ${s.test}.`, tone: 'warning' })
  if (!s.flagOk) out.push({ text: e.flag ? `Flag in the source: ${e.flag}.` : 'No flag in the source.', tone: 'warning' })
  if (!s.unitsOk) out.push({ text: e.units ? `Units in the source: ${e.units}.` : 'No units in the source.', tone: 'warning' })
  if (!s.referenceOk)
    out.push({ text: e.reference ? `Range in the source: ${e.reference}.` : 'No range in the source.', tone: 'warning' })
  return out
}

function checkText(c: RowCheck): string {
  if (c.state === 'extra') return 'This row has no match in the source.'
  if (!c.score) return 'No source to compare with.'
  const parts = differences(c.score).map((d) => d.text)
  return parts.length ? parts.join(' ') : 'Name, value, flag, units and range match the source.'
}

/** Units as printed: the OCR writes exponents as <sup>12</sup> or ^12. */
export function UnitText({ text }: { text: string | null }) {
  if (!text) return null
  const parts = text.split(/<sup>(.*?)<\/sup>|\^(\d+)/i)
  // split with two capture groups gives: text, sup, caret, text, sup, caret, ...
  return (
    <>
      {parts.map((part, i) =>
        part === undefined || part === '' ? null : i % 3 === 0 ? part : <sup key={i}>{part}</sup>,
      )}
    </>
  )
}

/** The short lines under a value that say what differs, so a phone needs no tooltip. */
function InlineDiff({ check }: { check: RowCheck }) {
  if (check.state === 'extra') return <div className="text-xs text-warning">No match in the source.</div>
  if (!check.score) return null
  return (
    <>
      {differences(check.score).map((d) => (
        <div key={d.text} className={`text-xs ${d.tone === 'danger' ? 'text-danger' : 'text-warning'}`}>
          <UnitText text={d.text} />
        </div>
      ))}
    </>
  )
}

function CheckMark({ check }: { check: RowCheck }) {
  if (check.state === 'unscored') return null
  const icon =
    check.state === 'ok' ? (
      <Check size={16} strokeWidth={1.75} className="text-success" aria-hidden="true" />
    ) : check.state === 'value' ? (
      <X size={16} strokeWidth={1.75} className="text-danger" aria-hidden="true" />
    ) : check.state === 'extra' ? (
      <CircleAlert size={16} strokeWidth={1.75} className="text-warning" aria-hidden="true" />
    ) : (
      <TriangleAlert size={16} strokeWidth={1.75} className="text-warning" aria-hidden="true" />
    )
  const text = checkText(check)
  return (
    <Tooltip content={text} side="top">
      <button type="button" aria-label={text} className="flex size-7 items-center justify-center rounded-lg">
        {icon}
      </button>
    </Tooltip>
  )
}

const BASIS_TEXT: Record<RowBasis, string> = {
  named: 'the API cites this table. It does not cite single rows.',
  nearby: 'this table holds the rows next to it. The API cites tables, not single rows.',
  general: 'the API cites this region for the results list. It does not cite single rows.',
  none: 'the API gave no citation for this part of the results.',
}

function rowHighlight(row: LabResultRow, index: number, cite: RowCitation | undefined): Highlight {
  return {
    key: `row:${index}`,
    boxes: cite?.boxes ?? [],
    caption: `${row.test_name ?? 'This row'}: ${BASIS_TEXT[cite?.basis ?? 'general']}`,
  }
}

/** The extracted results, grouped by section, with a check against the source on each row. */
export function ResultsTable({
  rows,
  citations,
  score,
  activeKey,
  onHover,
  onPin,
}: {
  rows: LabResultRow[]
  citations: Citation[] | undefined
  score: Score | null
  activeKey: string | null
  onHover: (h: Highlight | null) => void
  onPin: (h: Highlight) => void
}) {
  const { checks, missed } = alignRows(rows, score)
  const cites = rowCitations(citations, rows)
  let section: string | null | undefined
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-3xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-secondary">
              <th scope="col" className="py-2 pr-2 pl-4 font-normal">Test</th>
              <th scope="col" className="px-2 py-2 font-normal">Value</th>
              <th scope="col" className="hidden px-2 py-2 font-normal sm:table-cell">Units</th>
              <th scope="col" className="hidden px-2 py-2 font-normal sm:table-cell">Reference range</th>
              <th scope="col" className="py-2 pr-3 pl-2 text-right font-normal">
                <span className="sr-only">Check against the source</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const showSection = row.section !== section && !!row.section
              section = row.section
              const h = rowHighlight(row, i, cites[i])
              const active = activeKey === h.key
              const check = checks[i] ?? { state: 'unscored', score: null }
              const flag = flagInfo(row.flag, row.abnormal)
              const range = row.reference_text
              return (
                <Fragment key={i}>
                  {showSection ? (
                    <tr className="border-t border-border">
                      <th colSpan={5} scope="colgroup" className="bg-surface-muted px-4 py-1.5 text-left text-xs font-medium">
                        {row.section}
                      </th>
                    </tr>
                  ) : null}
                  <tr
                    onMouseEnter={() => onHover(h)}
                    onMouseLeave={() => onHover(null)}
                    className={`border-t border-border-subtle transition-colors ${
                      active ? 'bg-accent-subtle' : 'hover:bg-surface-muted'
                    }`}
                  >
                    <th scope="row" className="py-1.5 pr-2 pl-4 text-left font-normal">
                      <button
                        type="button"
                        aria-pressed={active}
                        onFocus={() => onHover(h)}
                        onBlur={() => onHover(null)}
                        onClick={() => onPin(h)}
                        className="rounded text-left break-words"
                      >
                        {row.test_name ?? 'No name'}
                      </button>
                      {range ? <div className="text-xs text-secondary sm:hidden">Range {range}</div> : null}
                    </th>
                    <td className="px-2 py-1.5 align-top tabular-nums">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={flag && flag.tone !== 'neutral' ? 'font-medium' : undefined}>{row.value ?? ''}</span>
                        <span className="text-xs text-secondary sm:hidden">
                          <UnitText text={row.units} />
                        </span>
                        {flag ? (
                          <Badge size="sm" tone={flag.tone}>
                            {flag.label}
                          </Badge>
                        ) : null}
                      </div>
                      <InlineDiff check={check} />
                    </td>
                    <td className="hidden px-2 py-1.5 align-top text-secondary sm:table-cell">
                      <UnitText text={row.units} />
                    </td>
                    <td className="hidden px-2 py-1.5 align-top tabular-nums text-secondary sm:table-cell">{range}</td>
                    <td className="py-0.5 pr-3 pl-2 align-top">
                      <div className="flex justify-end">
                        <CheckMark check={check} />
                      </div>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {missed.length ? (
        <p className="text-xs text-secondary tabular-nums">
          Rows in the source that the extraction did not match:{' '}
          {missed.map((m) => `${m.test} (${m.expected.value}${m.expected.units ? ` ${m.expected.units}` : ''})`).join(', ')}.
        </p>
      ) : null}
    </div>
  )
}
