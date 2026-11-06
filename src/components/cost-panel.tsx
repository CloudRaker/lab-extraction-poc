import { AnimatedCounter } from '@/components/arc/animated-counter/animated-counter'
import { eventLabel, seconds } from '@/lib/format'

import type { Cost, Timings } from '@/shared/contract'

/** Credits for one run, with each counted event and the reason it counts. */
export function CostPanel({ cost, timings, pages }: { cost: Cost; timings: Timings; pages: number }) {
  const perPage = cost.credits / Math.max(1, pages)
  const steps = [
    ['Upload', timings.uploadMs],
    ['Classify', timings.classifyMs],
    ['Extract', timings.extractMs],
  ] as const
  return (
    <section aria-label="Cost" className="grid gap-4 rounded-3xl border border-border p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-medium">Cost of this run</h3>
        <div className="flex items-baseline gap-2 text-2xl">
          <AnimatedCounter value={cost.credits} animateOnView />
          <span className="text-sm text-secondary">credits</span>
        </div>
        <dl className="flex flex-col gap-1 text-xs tabular-nums">
          <div className="flex justify-between gap-2">
            <dt className="text-secondary">Price</dt>
            <dd>${cost.usd.toFixed(3)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-secondary">Per page</dt>
            <dd>
              {perPage} credits, ${(perPage * cost.creditUsd).toFixed(3)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-secondary">Total time</dt>
            <dd>{seconds(timings.totalMs)}</dd>
          </div>
        </dl>
        <p className="text-xs tabular-nums text-secondary">
          {steps
            .filter(([, ms]) => ms !== null)
            .map(([label, ms]) => `${label} ${seconds(ms as number)}`)
            .join(', ')}
        </p>
      </div>
      <ul className="flex min-w-0 flex-col gap-2 border-t border-border-subtle pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
        {cost.lines.map((l) => (
          <li key={l.event} className="text-xs">
            <div className="flex justify-between gap-2 tabular-nums">
              <span>
                {l.units} × {eventLabel(l.event)} at {l.rate}
              </span>
              <span>{l.credits}</span>
            </div>
            <p className="text-secondary">{l.reason}</p>
          </li>
        ))}
      </ul>
      <p className="border-t border-border-subtle pt-3 text-xs text-secondary sm:col-span-2">
        Estimate at Pro plan list rates{cost.ratesSource === 'catalog' ? ' from the live catalog' : ' (built-in copy)'}.
        Runs report pages, not credits.
      </p>
    </section>
  )
}
