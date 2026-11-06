import type { Score } from '@/shared/contract'

/** How the extracted rows compare with the ground truth of the page. */
export function ScoreBar({ score }: { score: Score }) {
  const pct = score.rowsExpected ? (score.valuesCorrect / score.rowsExpected) * 100 : 0
  const headline = `${score.valuesCorrect} of ${score.rowsExpected} values match the source`
  return (
    <section aria-label="Score against the source" className="flex flex-col gap-2 rounded-3xl border border-border p-4">
      <h3 className="text-sm font-medium tabular-nums">{headline}</h3>
      <div role="img" aria-label={`${Math.round(pct)} percent`} className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs tabular-nums text-secondary">
        Rows found {score.rowsFound} of {score.rowsExpected}. Flags {score.flagsCorrect}. Units {score.unitsCorrect}.
      </p>
      <p className="text-xs text-secondary">The source is the exact text the synthetic page was made from.</p>
    </section>
  )
}
