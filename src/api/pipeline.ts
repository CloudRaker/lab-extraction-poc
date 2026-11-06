// One sample, end to end: upload, classify, extract (lab reports only), score.
// The worker route POST /api/run and scripts/run-samples.ts both call runSample.

import { CLASSES, CLASSIFY_INSTRUCTIONS, LAB_REPORT_INSTRUCTIONS, LAB_REPORT_SCHEMA } from '../shared/lab-schema'
import { scoreReport } from '../shared/score'
import { cost, runUnits, type Rates } from './cost'
import { deleteFile, getRun, PaperworkError, startRun, uploadFile, waitRun, type PaperworkConfig, type Run } from './paperwork'

import type { Citation, Classification, Extraction, LabReport, RunResult } from '../shared/contract'

export const OPTIONS = {
  citations: true,
  judge: true,
  ttl: 3600, // runs and their data are purged after one hour
  deadlineMs: 240_000, // whole pipeline (a slow page took 150 s in testing)
}

export class StepError extends PaperworkError {
  constructor(
    public step: 'upload' | 'classify' | 'extract',
    cause: PaperworkError,
    public runId?: string,
  ) {
    super(cause.status, cause.code, cause.message, cause.retryable)
  }
}

export interface SampleInput {
  id: string
  name: string // file name sent to the API
  mimeType: string
  bytes: ArrayBuffer | Uint8Array
  /** synthdocs page_md, for scoring. Omit to skip the score. */
  truthMd?: string | null
}

async function step<T>(name: StepError['step'], fn: () => Promise<T>, runId?: () => string | undefined) {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof StepError) throw e
    const pe =
      e instanceof PaperworkError ? e : new PaperworkError(500, 'internal', String(e), false)
    throw new StepError(name, pe, runId?.())
  }
}

function failIfNotProcessed(run: Run) {
  if (run.status !== 'processed') {
    throw new PaperworkError(
      502,
      'run_failed',
      `run ${run.id} ended ${run.status}${run.error ? `: ${run.error.code} ${run.error.message}` : ''}`,
      false,
    )
  }
}

/** A processed run can answer without its output. Read it once more, then fail the step. */
async function withOutput(cfg: PaperworkConfig, run: Run): Promise<Run> {
  failIfNotProcessed(run)
  if (run.output) return run
  const again = await getRun(cfg, run.id)
  failIfNotProcessed(again)
  if (!again.output) throw new PaperworkError(502, 'no_output', `run ${run.id} ended with no output`, true)
  return again
}

export type RunStep = 'upload' | 'classify' | 'extract'

export async function runSample(
  cfg: PaperworkConfig,
  input: SampleInput,
  rates: Rates,
  onStep?: (step: RunStep) => void,
): Promise<RunResult> {
  const t0 = Date.now()
  onStep?.('upload')
  const deadline = t0 + OPTIONS.deadlineMs

  const fileId = await step('upload', () =>
    uploadFile(cfg, { name: input.name, mimeType: input.mimeType, bytes: input.bytes }),
  )
  const t1 = Date.now()
  onStep?.('classify')

  try {
    // Classify. On a fresh file this also waits for the parse (OCR) to finish.
    let classifyId: string | undefined
    const classifyRun = await step(
      'classify',
      async () => {
        const started = await startRun(cfg, 'classify', {
          file: { id: fileId },
          classes: CLASSES,
          instructions: CLASSIFY_INSTRUCTIONS,
          ttl: OPTIONS.ttl,
        }, deadline)
        classifyId = started.id
        return withOutput(cfg, await waitRun(cfg, started, deadline))
      },
      () => classifyId,
    )
    const t2 = Date.now()
    const out = classifyRun.output ?? {}
    const classification: Classification = {
      classId: String(out['classId'] ?? 'other'),
      confidence: typeof out['confidence'] === 'number' ? out['confidence'] : null,
      reasoning: typeof out['reasoning'] === 'string' ? out['reasoning'] : null,
    }
    // usage.pages counts the pages sent to the model. The bundled samples have one page,
    // so this is also the parsed page count. A longer file needs its own page count here.
    const pages = Number(classifyRun.usage?.['pages'] ?? 1) || 1

    // Extract, only for lab reports.
    let extractRun: Run | null = null
    let extractSkipped: string | null = null
    let t3 = t2
    if (classification.classId === 'lab_report') {
      onStep?.('extract')
      let extractId: string | undefined
      extractRun = await step(
        'extract',
        async () => {
          const started = await startRun(cfg, 'extract', {
            file: { id: fileId },
            schema: LAB_REPORT_SCHEMA,
            instructions: LAB_REPORT_INSTRUCTIONS,
            unit: 'per_document',
            citations: OPTIONS.citations,
            judge: OPTIONS.judge,
            ttl: OPTIONS.ttl,
          }, deadline)
          extractId = started.id
          return withOutput(cfg, await waitRun(cfg, started, deadline))
        },
        () => extractId,
      )
      t3 = Date.now()
    } else {
      extractSkipped = `Classified as ${classification.classId}, so the lab report extraction did not run.`
    }

    let extraction: Extraction | null = null
    if (extractRun) {
      const o = extractRun.output ?? {}
      const docs = o['documents'] as Array<Record<string, unknown>> | undefined
      const value = (o['value'] ?? docs?.[0]?.['value'] ?? {}) as LabReport
      const citations = (o['citations'] ?? docs?.[0]?.['citations'] ?? {}) as Record<string, Citation[]>
      extraction = { value, citations }
    }

    const extracted = extractRun ? pages : 0
    const c = cost(
      rates,
      runUnits({
        mimeType: input.mimeType,
        pages,
        classified: pages,
        extracted,
        citations: OPTIONS.citations,
        judge: OPTIONS.judge,
      }),
    )

    return {
      sampleId: input.id,
      ranAt: new Date(t0).toISOString(),
      apiBase: cfg.apiBase,
      fileId,
      runs: { classify: classifyRun.id, extract: extractRun?.id ?? null },
      classification,
      extraction,
      extractSkipped,
      usage: {
        classify: classifyRun.usage ?? null,
        extract: extractRun?.usage ?? null,
      },
      cost: c,
      timings: {
        uploadMs: t1 - t0,
        classifyMs: t2 - t1,
        extractMs: extractRun ? t3 - t2 : null,
        totalMs: t3 - t0,
      },
      score: input.truthMd ? scoreReport(input.truthMd, extraction?.value) : null,
    }
  } finally {
    await deleteFile(cfg, fileId)
  }
}
