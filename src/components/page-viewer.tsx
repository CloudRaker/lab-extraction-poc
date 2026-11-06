import { Minus, Plus, ScanLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/arc/button/button'

import type { Box } from '@/lib/report'
import type { SampleInfo } from '@/shared/contract'

const ZOOMS = [1, 1.5, 2, 3]

export interface Highlight {
  key: string
  boxes: Box[]
  caption: string
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The page image with zoom, and the cited regions drawn on top. Boxes use page fractions (0 to 1). */
export function PageViewer({
  sample,
  highlight,
  hasCitations,
}: {
  sample: SampleInfo
  highlight: Highlight | null
  hasCitations: boolean
}) {
  const [zoomIndex, setZoomIndex] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const zoom = ZOOMS[zoomIndex] ?? 1

  // Bring the first cited box into view inside the scroller, never by moving the page.
  useEffect(() => {
    const el = scroller.current
    const box = highlight?.boxes[0]
    if (!el || !box) return
    const width = el.clientWidth * zoom
    const height = (width * sample.height) / sample.width
    el.scrollTo({
      left: Math.max(0, (box.x + box.width / 2) * width - el.clientWidth / 2),
      top: Math.max(0, (box.y + box.height / 2) * height - el.clientHeight / 2),
      behavior: reducedMotion() ? 'auto' : 'smooth',
    })
  }, [highlight, zoom, sample.height, sample.width])

  return (
    <section aria-label="Document page" className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Source page</h2>
        <div className="flex items-center gap-1">
          <span className="w-12 text-right text-xs tabular-nums text-secondary" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="md"
            aria-label="Zoom out"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
          >
            <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="md"
            aria-label="Zoom in"
            disabled={zoomIndex === ZOOMS.length - 1}
            onClick={() => setZoomIndex((i) => Math.min(ZOOMS.length - 1, i + 1))}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="md"
            aria-label="Fit page to width"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex(0)}
          >
            <ScanLine size={16} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div
        ref={scroller}
        // A scroll area needs a tab stop so keyboard users can pan a zoomed page.
        tabIndex={0}
        aria-label="Page image, scrollable when zoomed"
        role="group"
        className="max-h-[70dvh] overflow-auto rounded-2xl border border-border bg-surface-muted lg:max-h-[calc(100dvh-8.5rem)]"
      >
        <div className="relative" style={{ width: `${zoom * 100}%` }}>
          <img
            src={`/api/samples/${sample.id}/image`}
            alt={`${sample.title}. Synthetic document page.`}
            width={sample.width}
            height={sample.height}
            className="block h-auto w-full"
            draggable={false}
          />
          {highlight?.boxes.map((b) => (
            <div
              key={`${highlight.key}:${b.x}:${b.y}`}
              className="cite-box"
              style={{
                left: `${b.x * 100}%`,
                top: `${b.y * 100}%`,
                width: `${b.width * 100}%`,
                height: `${b.height * 100}%`,
              }}
            />
          ))}
        </div>
      </div>
      {hasCitations ? (
        <p className="min-h-8 text-xs text-secondary" aria-live="polite">
          {highlight?.caption ?? 'Point at a field or a result row to see where it comes from on the page.'}
        </p>
      ) : null}
    </section>
  )
}
