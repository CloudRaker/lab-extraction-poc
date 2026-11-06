import { Check, TriangleAlert } from 'lucide-react'

import { Badge } from '@/components/arc/badge/badge'
import { doctypeLabel } from '@/lib/format'

import type { Classification } from '@/shared/contract'

/** The class the API gave the page, next to the class of the source document. */
export function ClassificationCard({ classification, doctype }: { classification: Classification; doctype: string | null }) {
  const matches = classification.classId === doctype
  return (
    <section aria-label="Classification" className="flex flex-col gap-2 rounded-3xl border border-border p-4">
      <h3 className="text-sm font-medium">Classification</h3>
      <p className="text-xl">{doctypeLabel(classification.classId)}</p>
      <div className="flex flex-wrap items-center gap-2">
        {classification.confidence !== null ? (
          <Badge size="sm">Confidence {classification.confidence} of 5</Badge>
        ) : null}
        {doctype === null ? null : matches ? (
          <Badge size="sm" tone="success" icon={<Check size={12} strokeWidth={1.75} aria-hidden="true" />}>
            Matches the source
          </Badge>
        ) : (
          <Badge size="sm" tone="danger" icon={<TriangleAlert size={12} strokeWidth={1.75} aria-hidden="true" />}>
            Source is {doctypeLabel(doctype).toLowerCase()}
          </Badge>
        )}
      </div>
      {classification.reasoning ? <p className="text-xs text-secondary">{classification.reasoning}</p> : null}
    </section>
  )
}
