import type { Score } from '@/shared/contract'

/** How the extracted rows compare with the ground truth of the page. */
export function ScoreBar({ score }: { score: Score }) {
  const pct = score.rowsExpected ? (score.valuesCorrect / score.rowsExpected) * 100 : 0
  const headline = `${score.valuesCorrect} of ${score.rowsExpected} values match the source`
  const rows = score.rowsExpected
  const details: Array<[string, number, number]> = [
    ['Rows found', score.rowsFound, rows],
    ['Test names', score.namesCorrect, rows],
    ['Flags', score.flagsCorrect, rows],
    ['Units', score.unitsCorrect, rows],
    ['Reference ranges', score.referencesCorrect, rows],
  ]
  if (score.fields.length) {
    details.push(['Patient and report fields', score.fields.filter((f) => f.ok).length, score.fields.length])
  }
  return (
    <section aria-label="Score against the source" className="flex flex-col gap-2 rounded-3xl border border-border p-4">
      <h3 className="text-sm font-medium tabular-nums">{headline}</h3>
      <div role="img" aria-label={`${Math.round(pct)} percent`} className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <ul className="flex flex-col gap-0.5 text-xs tabular-nums text-secondary">
        {details.map(([label, n, total]) => (
          <li key={label} className="flex justify-between gap-2">
            <span>{label}</span>
            <span>
              {n} of {total}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-secondary">The source is the exact text the synthetic page was made from.</p>
    </section>
  )
}
