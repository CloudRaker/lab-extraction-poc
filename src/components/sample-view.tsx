import { useQuery } from '@tanstack/react-query'
import { LoaderCircle, Play, RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'

import { Alert } from '@/components/arc/alert/alert'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { JsonViewer } from '@/components/arc/json-viewer/json-viewer'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { getSavedResult } from '@/lib/api'
import { doctypeLabel, langLabel, presetLabel, SAMPLE_NOTES, seconds, shortDate } from '@/lib/format'

import { ClassificationCard } from './classification-card'
import { CostPanel } from './cost-panel'
import { PageViewer, type Highlight } from './page-viewer'
import { ReportFields } from './report-fields'
import { ResultsTable } from './results-table'
import { RunProgress, type LiveRunState } from './run-live'
import { ScoreBar } from './score-bar'

import type { UploadedFile } from '@/lib/upload'
import type { RunResult, SampleInfo } from '@/shared/contract'

/** The selected sample: the page on one side, and what the API returned on the other. */
export function SampleView({
  sample,
  upload,
  live,
  liveRunsOff,
  onRun,
  onShowSaved,
}: {
  sample: SampleInfo
  /** Set when the view shows the user's file: its pages, and no saved run or ground truth. */
  upload?: UploadedFile | null
  live: LiveRunState
  liveRunsOff: boolean
  onRun: () => void
  onShowSaved: () => void
}) {
  const saved = useQuery({
    queryKey: ['result', sample.id],
    queryFn: () => getSavedResult(sample.id),
    enabled: sample.hasResult,
    staleTime: Infinity,
  })
  const liveResult = live.results[sample.id]
  const result = liveResult ?? saved.data
  const running = live.sampleId === sample.id
  const otherRunning = live.sampleId !== null && !running
  const failure = live.error?.sampleId === sample.id ? live.error.body : null
  const note = SAMPLE_NOTES[sample.id]

  // Hover shows a citation for a moment. A click or Enter pins it.
  const [hover, setHover] = useState<Highlight | null>(null)
  const [pinned, setPinned] = useState<Highlight | null>(null)
  const active = hover ?? pinned

  // On a phone the page sits far above the rows, so a tap goes to the page and offers the way back.
  const viewer = useRef<HTMLElement>(null)
  const tapped = useRef<HTMLElement | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const motion = (): ScrollBehavior =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  const pin = (h: Highlight) => {
    const unpin = pinned?.key === h.key
    setPinned(unpin ? null : h)
    if (unpin || window.matchMedia('(min-width: 1024px)').matches) return
    tapped.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    viewer.current?.scrollIntoView({ block: 'start', behavior: motion() })
    setCanGoBack(true)
  }
  const goBack = () => {
    tapped.current?.scrollIntoView({ block: 'center', behavior: motion() })
    tapped.current?.focus({ preventScroll: true })
    setCanGoBack(false)
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <PageViewer
        pages={upload?.pages ?? [{ url: `/api/samples/${sample.id}/image`, width: sample.width, height: sample.height }]}
        alt={upload ? 'Your file.' : `${sample.title}. Synthetic document page.`}
        highlight={active}
        hasCitations={!!result?.extraction}
        sectionRef={viewer}
        onBack={canGoBack ? goBack : null}
      />

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate text-lg font-medium">
              {upload ? upload.name : `${doctypeLabel(sample.doctype)}, ${presetLabel(sample.preset).toLowerCase()}`}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-secondary tabular-nums">
              {upload ? (
                <span>
                  {upload.pages.length} {upload.pages.length === 1 ? 'page' : 'pages'}
                </span>
              ) : (
                <>
                  <span>{langLabel(sample.lang)}</span>
                  <Badge size="sm">Synthetic</Badge>
                </>
              )}
              {result ? (
                <Badge size="sm" tone={liveResult ? 'info' : 'neutral'} dot={!!liveResult}>
                  {liveResult
                    ? `Live run, ${seconds(result.timings.totalMs)}`
                    : `Saved run, ${shortDate(result.ranAt)}`}
                </Badge>
              ) : null}
              {liveResult && sample.hasResult ? (
                <button type="button" onClick={onShowSaved} className="inline-flex items-center gap-1 rounded underline underline-offset-2">
                  <RotateCcw size={12} strokeWidth={1.75} aria-hidden="true" />
                  Show saved run
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button onClick={onRun} aria-busy={running || undefined} disabled={running || otherRunning || liveRunsOff}>
              <span className="inline-flex items-center gap-2">
                {running ? (
                  <LoaderCircle size={16} strokeWidth={1.75} aria-hidden="true" className="motion-safe:animate-spin" />
                ) : (
                  <Play size={16} strokeWidth={1.75} aria-hidden="true" />
                )}
                {running ? 'Running' : 'Run live'}
              </span>
            </Button>
            {otherRunning ? <p className="text-xs text-secondary">Another sample is running.</p> : null}
            {liveRunsOff ? <p className="text-xs text-secondary">Live runs are off here. These are saved runs.</p> : null}
          </div>
        </div>

        {running ? <RunProgress stepIndex={live.stepIndex} startedAt={live.startedAt} /> : null}

        {failure ? (
          <Alert tone="danger" title={`The live run failed${failure.step ? ` at ${failure.step}` : ''}`}>
            <p>{failure.message}</p>
            <div className="mt-2">
              <Button variant="secondary" size="sm" onClick={onRun} disabled={otherRunning}>
                Try the run again
              </Button>
            </div>
          </Alert>
        ) : null}

        {upload ? (
          <Alert tone="warning" title="Use test or de-identified documents only">
            Your file goes through this app to the CloudRaker paperwork API. The app asks the API to delete it after
            the run, and run data expires after one hour. A run uses credits. Your file has no source to compare with,
            so the results show no checks.
          </Alert>
        ) : null}

        {note ? (
          <Alert tone={note.tone} title={note.title}>
            {note.body}
          </Alert>
        ) : null}

        {saved.isError && !liveResult ? (
          <Alert tone="danger" title="The saved result did not load">
            <div className="mt-2">
              <Button variant="secondary" size="sm" onClick={() => void saved.refetch()}>
                Load the result again
              </Button>
            </div>
          </Alert>
        ) : null}

        {!result && (saved.isPending && sample.hasResult) ? <Skeleton label="Loading the saved result" lines={6} /> : null}

        {result ? (
          <div aria-busy={running || undefined} className="flex min-w-0 flex-col gap-4">
            {running ? (
              <p className="text-xs text-secondary">
                The numbers below are from the {liveResult ? 'last' : 'saved'} run. They change when this run ends.
              </p>
            ) : null}
            <div className={`flex min-w-0 flex-col gap-4 transition-opacity ${running ? 'opacity-50' : ''}`}>
              <ResultBody
                result={result}
                doctype={upload ? null : sample.doctype}
                activeKey={active?.key ?? null}
                onHover={setHover}
                onPin={pin}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ResultBody({
  result,
  doctype,
  activeKey,
  onHover,
  onPin,
}: {
  result: RunResult
  doctype: string | null
  activeKey: string | null
  onHover: (h: Highlight | null) => void
  onPin: (h: Highlight) => void
}) {
  const [view, setView] = useState('results')
  const pages = result.pages ?? (Number(result.usage.classify?.['pages'] ?? 1) || 1)
  const ex = result.extraction
  return (
    <>
      <div className={`grid gap-4 ${result.score ? 'sm:grid-cols-2' : ''}`}>
        <ClassificationCard classification={result.classification} doctype={doctype} />
        {result.score ? <ScoreBar score={result.score} /> : null}
      </div>
      <CostPanel key={result.ranAt} cost={result.cost} timings={result.timings} pages={pages} />

      {ex ? <ReportFields value={ex.value} citations={ex.citations} checks={result.score?.fields ?? []} activeKey={activeKey} onHover={onHover} onPin={onPin} /> : null}

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{ex ? 'Results' : 'Output'}</h3>
        <SegmentedControl
          label="Output format"
          value={view}
          onValueChange={setView}
          options={[
            { value: 'results', label: ex ? 'Table' : 'Summary' },
            { value: 'json', label: 'JSON' },
          ]}
        />
      </div>

      {view === 'json' ? (
        <JsonViewer data={result} rootName="result" defaultExpandDepth={2} maxHeight={560} label="Run result as JSON" />
      ) : ex ? (
        <ResultsTable
          rows={ex.value.results ?? []}
          citations={ex.citations['results']}
          score={result.score}
          activeKey={activeKey}
          onHover={onHover}
          onPin={onPin}
        />
      ) : (
        <p className="rounded-3xl border border-border p-4 text-sm text-secondary">
          The classifier says this document is not a lab report, so extraction did not run. The run costs only parsing and classification.
        </p>
      )}
    </>
  )
}
