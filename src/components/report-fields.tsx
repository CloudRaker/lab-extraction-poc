import { boxesOf, cleanCitationText } from '@/lib/report'

import type { Citation, LabReport } from '@/shared/contract'
import type { Highlight } from './page-viewer'

const FIELDS: Array<[keyof LabReport, string]> = [
  ['patient_name', 'Patient'],
  ['health_insurance_number', 'Health insurance number'],
  ['date_of_birth', 'Date of birth'],
  ['sex', 'Sex'],
  ['ordering_physician', 'Ordering physician'],
  ['lab_name', 'Laboratory'],
  ['collected_at', 'Collected'],
  ['reported_at', 'Reported'],
  ['report_status', 'Report status'],
]

export function fieldHighlight(label: string, key: string, citations: Citation[] | undefined): Highlight {
  const first = citations?.find((c) => c.bbox)
  const text = cleanCitationText(first?.text)
  const conf = first?.confidence !== undefined ? ` Confidence ${first.confidence} of 5.` : ''
  return {
    key: `field:${key}`,
    boxes: boxesOf(citations),
    caption: first ? `${label}: cited text "${text}".${conf}` : `${label}: no citation for this field.`,
  }
}

/** Patient and report fields. Each value is a control that shows its citation on the page. */
export function ReportFields({
  value,
  citations,
  activeKey,
  onHover,
  onPin,
}: {
  value: LabReport
  citations: Record<string, Citation[]>
  activeKey: string | null
  onHover: (h: Highlight | null) => void
  onPin: (h: Highlight) => void
}) {
  return (
    <section aria-label="Report fields" className="rounded-3xl border border-border p-4">
      <h3 className="mb-2 text-sm font-medium">Patient and report</h3>
      <dl className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {FIELDS.map(([key, label]) => {
          const raw = value[key]
          const text = typeof raw === 'string' && raw.trim() ? raw : null
          const h = fieldHighlight(label, key, citations[key])
          const active = activeKey === h.key
          return (
            <div key={key} className="min-w-0 py-1">
              <dt className="px-2 text-xs text-secondary">{label}</dt>
              <dd>
                {text ? (
                  <button
                    type="button"
                    aria-pressed={active}
                    onMouseEnter={() => onHover(h)}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover(h)}
                    onBlur={() => onHover(null)}
                    onClick={() => onPin(h)}
                    className={`min-h-7 w-full rounded-lg px-2 py-0.5 text-left text-sm break-words transition-colors ${
                      active ? 'bg-accent-subtle' : 'hover:bg-surface-muted'
                    }`}
                  >
                    {text}
                  </button>
                ) : (
                  <span className="block px-2 py-0.5 text-sm text-muted">Not found</span>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
