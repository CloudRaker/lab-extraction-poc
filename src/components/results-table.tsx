import { Check, CircleAlert, TriangleAlert, X } from 'lucide-react'
import { Fragment } from 'react'

import { Badge } from '@/components/arc/badge/badge'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import { flagLabel } from '@/lib/format'
import { alignRows, rowBoxes, type RowCheck } from '@/lib/report'

import type { Citation, LabResultRow, Score } from '@/shared/contract'
import type { Highlight } from './page-viewer'

function checkText(c: RowCheck): string {
  const s = c.score
  if (c.state === 'extra') return 'This row has no match in the source.'
  if (!s) return 'No source to compare with.'
  const parts: string[] = []
  if (!s.valueOk) parts.push(`Value differs. Source: ${s.expected.value}.`)
  if (!s.flagOk) parts.push(`Flag differs. Source: ${s.expected.flag ?? 'no flag'}.`)
  if (!s.unitsOk) parts.push(`Units differ. Source: ${s.expected.units ?? 'no units'}.`)
  if (!s.nameOk) parts.push(`Name differs. Source: ${s.test}.`)
  return parts.length ? parts.join(' ') : 'Matches the source.'
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

/** The short line under a value that says what differs, so a phone needs no tooltip. */
function InlineDiff({ check }: { check: RowCheck }) {
  const s = check.score
  if (check.state === 'extra') return <div className="text-xs text-warning">No match in the source</div>
  if (check.state === 'value' && s) return <div className="text-xs text-danger">Source: {s.expected.value}</div>
  if (check.state === 'detail' && s) {
    const parts = [
      s.flagOk ? null : `flag ${s.expected.flag ?? 'none'}`,
      s.unitsOk ? null : `units ${s.expected.units ?? 'none'}`,
    ].filter((p): p is string => !!p)
    return (
      <div className="text-xs text-warning">
        Source: <UnitText text={parts.join(', ')} />
      </div>
    )
  }
  return null
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
    <Tooltip content={text} side="left">
      <button type="button" aria-label={text} className="flex size-7 items-center justify-center rounded-lg">
        {icon}
      </button>
    </Tooltip>
  )
}

export function rowHighlight(row: LabResultRow, index: number, citations: Citation[] | undefined): Highlight {
  const name = row.test_name ?? 'This row'
  return {
    key: `row:${index}`,
    boxes: rowBoxes(citations, row.test_name),
    caption: `${name}: the API cites the table that holds this row, not the single row.`,
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
              const h = rowHighlight(row, i, citations)
              const active = activeKey === h.key
              const check = checks[i] ?? { state: 'unscored', score: null }
              const flag = flagLabel(row.flag, row.abnormal)
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
                        <span className={flag ? 'font-medium' : undefined}>{row.value ?? ''}</span>
                        <span className="text-xs text-secondary sm:hidden">
                          <UnitText text={row.units} />
                        </span>
                        {flag ? (
                          <Badge size="sm" tone="warning">
                            {flag}
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
