import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/arc/button/button'
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog'
import { Input } from '@/components/arc/input/input'
import { Stepper } from '@/components/arc/stepper/stepper'
import { ApiFailure, runLive } from '@/lib/api'

import type { ApiError, RunResult } from '@/shared/contract'

export type RunStepId = 'upload' | 'classify' | 'extract'
const STEP_INDEX: Record<RunStepId, number> = { upload: 0, classify: 1, extract: 2 }

export interface LiveRunState {
  sampleId: string | null // the running sample
  stepIndex: number
  startedAt: number
  error: { sampleId: string; body: ApiError['error'] } | null
  results: Record<string, RunResult>
  codeNeeded: { sampleId: string; rejected: boolean } | null
}

/** One live run at a time, for any sample. Results stay for the session. */
export function useLiveRun(demoCodeRequired: boolean) {
  const [state, setState] = useState<LiveRunState>({
    sampleId: null,
    stepIndex: 0,
    startedAt: 0,
    error: null,
    results: {},
    codeNeeded: null,
  })
  const code = useRef<string | null>(null)

  const start = useCallback(
    async (sampleId: string) => {
      if (demoCodeRequired && !code.current) {
        setState((s) => ({ ...s, codeNeeded: { sampleId, rejected: false } }))
        return
      }
      setState((s) => ({ ...s, sampleId, stepIndex: 0, startedAt: Date.now(), error: null, codeNeeded: null }))
      try {
        const result = await runLive(sampleId, code.current, (step) =>
          setState((s) => ({ ...s, stepIndex: STEP_INDEX[step] })),
        )
        setState((s) => ({ ...s, sampleId: null, results: { ...s.results, [sampleId]: result } }))
      } catch (e) {
        if (e instanceof ApiFailure && (e.status === 401 || e.status === 403)) {
          code.current = null
          setState((s) => ({ ...s, sampleId: null, codeNeeded: { sampleId, rejected: true } }))
          return
        }
        const body =
          e instanceof ApiFailure
            ? e.body
            : { code: 'network', message: 'The connection failed. Check your network and try again.', retryable: true }
        setState((s) => ({ ...s, sampleId: null, error: { sampleId, body } }))
      }
    },
    [demoCodeRequired],
  )

  const submitCode = useCallback(
    (value: string, sampleId: string) => {
      code.current = value
      void start(sampleId)
    },
    [start],
  )
  const closeCode = useCallback(() => setState((s) => ({ ...s, codeNeeded: null })), [])
  const clearResult = useCallback(
    (sampleId: string) =>
      setState((s) => {
        const { [sampleId]: _removed, ...results } = s.results
        return { ...s, results }
      }),
    [],
  )

  return { state, start, submitCode, closeCode, clearResult }
}

/** Step progress of a live run. The worker reports each step as it starts. */
export function RunProgress({ stepIndex, startedAt }: { stepIndex: number; startedAt: number }) {
  const [now, setNow] = useState(startedAt)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <section aria-label="Live run progress" className="flex flex-col gap-3 rounded-3xl border border-border p-4">
      <Stepper
        current={stepIndex}
        label="Live run progress"
        steps={[
          { id: 'upload', label: 'Upload' },
          { id: 'classify', label: 'OCR and classify' },
          { id: 'extract', label: 'Extract', description: 'Lab reports only' },
        ]}
      />
      <p className="text-xs tabular-nums text-secondary">
        Running for {Math.max(0, Math.round((now - startedAt) / 1000))} s. A live run takes about 25 to 150 seconds.
      </p>
    </section>
  )
}

export function DemoCodeDialog({
  need,
  onSubmit,
  onClose,
}: {
  need: { sampleId: string; rejected: boolean } | null
  onSubmit: (code: string, sampleId: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (need && value.trim()) onSubmit(value.trim(), need.sampleId)
  }
  return (
    <Dialog open={!!need} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Enter the demo code" description="A live run uses paid credits, so it needs a code. Saved results stay open.">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            label="Demo code"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoFocus
            error={need?.rejected ? 'That code did not work. Check it and try again.' : undefined}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              Start live run
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
