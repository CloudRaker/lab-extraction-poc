import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { Badge } from '@/components/arc/badge/badge'
import { doctypeLabel, presetLabel, SAMPLE_NOTES } from '@/lib/format'

import type { SampleInfo } from '@/shared/contract'

function SampleLink({ sample, selected }: { sample: SampleInfo; selected: boolean }) {
  const badge = SAMPLE_NOTES[sample.id]?.badge
  return (
    <Link
      to="/"
      search={{ sample: sample.id }}
      replace
      resetScroll={false}
      aria-current={selected ? 'page' : undefined}
      className={`flex w-52 shrink-0 items-center gap-2 rounded-2xl p-1.5 transition-colors xl:w-full ${
        selected ? 'bg-accent-subtle' : 'hover:bg-surface-muted'
      }`}
    >
      <img
        src={`/samples/thumbs/${sample.id}.jpg`}
        alt=""
        width={36}
        height={46}
        loading="lazy"
        className="h-[46px] w-9 shrink-0 rounded-md border border-border bg-surface-muted object-cover"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{presetLabel(sample.preset)}</span>
        <span className="flex items-center gap-1">
          <Badge size="sm" aria-label={sample.lang === 'fr' ? 'French' : 'English'}>
            {sample.lang.toUpperCase()}
          </Badge>
          {badge ? (
            <Badge size="sm" tone="warning">
              {badge}
            </Badge>
          ) : null}
          {sample.doctype === 'lab_report' ? null : (
            <span className="truncate text-xs text-secondary">{doctypeLabel(sample.doctype)}</span>
          )}
        </span>
      </span>
    </Link>
  )
}

/** The sample picker: a column on wide screens, a sideways strip below that. */
export function SampleRail({ samples, selectedId }: { samples: SampleInfo[]; selectedId: string }) {
  const nav = useRef<HTMLElement>(null)
  // Keep the selected sample visible. Scroll the rail only, never the page.
  useEffect(() => {
    const el = nav.current
    const link = el?.querySelector('[aria-current="page"]')
    if (!el || !link) return
    const a = el.getBoundingClientRect()
    const b = link.getBoundingClientRect()
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({
      left: b.left < a.left || b.right > a.right ? b.left - a.left - (a.width - b.width) / 2 : 0,
      top: b.top < a.top || b.bottom > a.bottom ? b.top - a.top - (a.height - b.height) / 2 : 0,
      behavior: smooth ? 'smooth' : 'auto',
    })
  }, [selectedId])

  const hard = (s: SampleInfo) => (SAMPLE_NOTES[s.id]?.badge ? 1 : 0)
  const labs = samples.filter((s) => s.doctype === 'lab_report').sort((a, b) => hard(a) - hard(b))
  const others = samples.filter((s) => s.doctype !== 'lab_report')
  const group = (title: string, list: SampleInfo[]) => (
    <div className="flex shrink-0 flex-col gap-2 xl:shrink">
      <h2 className="px-2 text-xs text-secondary">
        {title} ({list.length})
      </h2>
      <div className="flex gap-0.5 xl:flex-col">
        {list.map((s) => (
          <SampleLink key={s.id} sample={s} selected={s.id === selectedId} />
        ))}
      </div>
    </div>
  )
  return (
    <nav ref={nav} aria-label="Sample documents" className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 xl:sticky xl:top-4 xl:mx-0 xl:max-h-[calc(100dvh-2rem)] xl:flex-col xl:gap-3 xl:self-start xl:overflow-x-hidden xl:overflow-y-auto xl:px-0 xl:pb-0">
      {group('Lab reports', labs)}
      {group('Other documents', others)}
    </nav>
  )
}
