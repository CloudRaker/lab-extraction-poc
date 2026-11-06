import { Minus, Plus, ScanLine } from 'lucide-react'
import { useEffect, useRef, useState, type Ref } from 'react'

import { Button } from '@/components/arc/button/button'

import type { Box } from '@/lib/report'
import type { PageImage } from '@/lib/upload'

const ZOOMS = [1, 1.5, 2, 3]

export interface Highlight {
  key: string
  boxes: Box[]
  caption: string
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The page images with zoom, and the cited regions drawn on top. Boxes use page fractions (0 to 1). */
export function PageViewer({
  pages,
  alt,
  highlight,
  hasCitations,
  sectionRef,
  onBack,
}: {
  pages: PageImage[]
  alt: string
  highlight: Highlight | null
  hasCitations: boolean
  sectionRef?: Ref<HTMLElement>
  /** On a phone, the tap on a row moved the page here. This goes back to the row. */
  onBack?: (() => void) | null
}) {
  const [zoomIndex, setZoomIndex] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const zoom = ZOOMS[zoomIndex] ?? 1

  // Bring the first cited box into view inside the scroller, never by moving the page.
  // A box that shows in full stays where it is. A box taller than the view shows its top edge.
  useEffect(() => {
    const el = scroller.current
    const box = highlight?.boxes[0]
    if (!el || !box) return
    const width = el.clientWidth * zoom
    const heightOf = (p: PageImage) => (width * p.height) / p.width
    const above = pages.slice(0, box.page).reduce((sum, p) => sum + heightOf(p), 0)
    const page = pages[box.page] ?? pages[0]
    if (!page) return
    const height = heightOf(page)
    const [x, y, w, h] = [box.x * width, above + box.y * height, box.width * width, box.height * height]
    const shown =
      x >= el.scrollLeft &&
      y >= el.scrollTop &&
      x + w <= el.scrollLeft + el.clientWidth &&
      y + h <= el.scrollTop + el.clientHeight
    if (shown) return
    const edge = (start: number, size: number, view: number) =>
      Math.max(0, size > view ? start - 16 : start + size / 2 - view / 2)
    el.scrollTo({
      left: edge(x, w, el.clientWidth),
      top: edge(y, h, el.clientHeight),
      behavior: reducedMotion() ? 'auto' : 'smooth',
    })
  }, [highlight, zoom, pages])

  return (
    <section ref={sectionRef} aria-label="Document page" className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
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
        <div className="flex flex-col gap-2" style={{ width: `${zoom * 100}%` }}>
          {pages.map((page, n) => (
            <div key={page.url} className="relative">
              <img
                src={page.url}
                alt={pages.length > 1 ? `${alt} Page ${n + 1} of ${pages.length}.` : alt}
                width={page.width}
                height={page.height}
                className="block h-auto w-full"
                draggable={false}
              />
              {highlight?.boxes
                .filter((b) => b.page === n)
                .map((b) => (
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
          ))}
        </div>
      </div>
      {hasCitations ? (
        <div className="flex min-h-8 items-start justify-between gap-3">
          <p className="text-xs text-secondary" aria-live="polite">
            {highlight?.caption ?? 'Point at a field or a result row to see where it comes from on the page.'}
          </p>
          {onBack ? (
            <Button variant="secondary" size="sm" className="shrink-0 lg:hidden" onClick={onBack}>
              Back to the results
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
