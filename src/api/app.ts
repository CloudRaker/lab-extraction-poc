// Hono API for the browser. Every route is same-origin under /api.
// The worker holds PAPERWORK_API_KEY; the browser never sees it.
// Contract types: src/shared/contract.ts.

import { Hono, type Context } from 'hono'

import { loadRates } from './cost'
import { PaperworkError } from './paperwork'
import { OPTIONS, StepError, runSample, type RunStep, type SampleInput } from './pipeline'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_PAGES } from '../shared/contract'

import type { ApiError, AppConfig, RunEvent, RunRequest, SampleInfo } from '../shared/contract'

type Env = { Bindings: CloudflareBindings }

const ID = /^\d{4}_\d{6}$/

function fail(
  c: Context<Env>,
  status: 400 | 401 | 403 | 404 | 413 | 415 | 429 | 500 | 502 | 504,
  code: string,
  message: string,
  extra: Partial<ApiError['error']> = {},
) {
  const body: ApiError = { error: { code, message, retryable: status >= 500, ...extra } }
  return c.json(body, status)
}

/** Read a file from the static assets (public/). */
async function asset(c: Context<Env>, path: string): Promise<Response | null> {
  const res = await c.env.ASSETS.fetch(new Request(new URL(`/${path}`, c.req.url)))
  return res.ok ? res : null
}

async function sampleIndex(c: Context<Env>): Promise<SampleInfo[]> {
  const res = await asset(c, 'samples/index.json')
  if (!res) throw new Error('samples/index.json is missing')
  return (await res.json()) as SampleInfo[]
}

async function findSample(c: Context<Env>, id: string): Promise<SampleInfo | null> {
  if (!ID.test(id)) return null
  return (await sampleIndex(c)).find((s) => s.id === id) ?? null
}

const app = new Hono<Env>().basePath('/api')

app.onError((err, c) => {
  console.error('unhandled', err)
  return fail(c, 500, 'internal', 'Something went wrong. Try again.')
})

/** Live runs spend credits. A deployment with no DEMO_CODE keeps them closed; localhost stays open. */
function liveRunsOff(c: Context<Env>): boolean {
  if (c.env.DEMO_CODE) return false
  const host = new URL(c.req.url).hostname
  return host !== 'localhost' && host !== '127.0.0.1'
}

app.get('/config', async (c) => {
  const r = await loadRates(c.env.CATALOG_URL)
  const body: AppConfig = {
    demoCodeRequired: !!c.env.DEMO_CODE,
    liveRunsOff: liveRunsOff(c),
    creditUsd: r.creditUsd,
    rates: r.rates,
    ratesSource: r.source,
    judge: OPTIONS.judge,
  }
  return c.json(body)
})

app.get('/samples', async (c) => c.json(await sampleIndex(c)))

app.get('/samples/:id/image', async (c) => {
  const s = await findSample(c, c.req.param('id'))
  if (!s) return fail(c, 404, 'not_found', 'No such sample.')
  const res = await asset(c, `samples/${s.image}`)
  if (!res) return fail(c, 404, 'not_found', 'The sample image is missing.')
  return new Response(res.body, {
    headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=86400' },
  })
})

app.get('/samples/:id/result', async (c) => {
  const s = await findSample(c, c.req.param('id'))
  if (!s) return fail(c, 404, 'not_found', 'No such sample.')
  const res = await asset(c, `samples/results/${s.id}.json`)
  if (!res) return fail(c, 404, 'not_found', 'No saved result for this sample. Run it live.')
  return new Response(res.body, {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  })
})

/** Checks shared by every live route. Returns the error response, or null when the run can go. */
async function checkLive(c: Context<Env>): Promise<Response | null> {
  if (liveRunsOff(c)) {
    return fail(c, 403, 'live_runs_off', 'Live runs are off on this deployment. Set DEMO_CODE to turn them on.', {
      retryable: false,
    })
  }
  // Before the code check, so the limit also slows a guess at the code.
  const ip = c.req.header('cf-connecting-ip') ?? 'local'
  const allowed = c.env.RUN_LIMIT ? (await c.env.RUN_LIMIT.limit({ key: ip })).success : true
  if (!allowed) return fail(c, 429, 'rate_limited', 'Too many live runs. Wait a minute and try again.', { retryable: true })
  if (c.env.DEMO_CODE && c.req.header('x-demo-code') !== c.env.DEMO_CODE) {
    return fail(c, 401, 'demo_code_required', 'Enter the demo code to run a live extraction.')
  }
  if (!c.env.PAPERWORK_API_KEY) {
    return fail(c, 500, 'not_configured', 'The worker has no PAPERWORK_API_KEY.')
  }
  return null
}

/** Checks a sample run request. Returns the sample files, or an error response. */
async function prepareRun(c: Context<Env>): Promise<SampleInput | Response> {
  const stop = await checkLive(c)
  if (stop) return stop
  let body: RunRequest
  try {
    body = await c.req.json<RunRequest>()
  } catch {
    return fail(c, 400, 'bad_request', 'Send JSON: {"sampleId": "..."}.')
  }
  const s = typeof body?.sampleId === 'string' ? await findSample(c, body.sampleId) : null
  if (!s) return fail(c, 404, 'not_found', 'No such sample.')

  const [file, truth] = await Promise.all([
    asset(c, `samples/${s.file}`),
    asset(c, `samples/${s.id}.json`),
  ])
  if (!file || !truth) return fail(c, 500, 'internal', 'The sample files are missing.')
  const truthMd = s.doctype === 'lab_report' ? ((await truth.json()) as { page_md: string }).page_md : null
  return { id: s.id, name: s.file, mimeType: s.mime, bytes: await file.arrayBuffer(), truthMd }
}

async function execute(c: Context<Env>, input: SampleInput, onStep?: (step: RunStep) => void) {
  return runSample(
    { apiBase: c.env.API_BASE, apiKey: c.env.PAPERWORK_API_KEY },
    input,
    await loadRates(c.env.CATALOG_URL), // cached, falls back on error
    onStep,
  )
}

/** The file type from its first bytes. The name and type the browser sends are not checked. */
export function sniffFile(bytes: Uint8Array): { mimeType: string; ext: string } | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b)
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { mimeType: 'application/pdf', ext: 'pdf' }
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mimeType: 'image/png', ext: 'png' }
  if (starts(0xff, 0xd8, 0xff)) return { mimeType: 'image/jpeg', ext: 'jpg' }
  return null
}

/** Maps a pipeline failure to the API error shape and HTTP status. */
function toApiError(e: PaperworkError): { status: 502 | 504; error: ApiError['error'] } {
  const step = e instanceof StepError ? e.step : undefined
  const runId = e instanceof StepError ? e.runId : undefined
  const timeout = e.code === 'timeout'
  return {
    status: timeout ? 504 : 502,
    error: {
      code: timeout ? 'timeout' : e.code,
      message: e.message,
      retryable: e.retryable,
      ...(step ? { step } : {}),
      ...(runId ? { runId } : {}),
    },
  }
}

app.post('/run', async (c) => {
  const p = await prepareRun(c)
  if (p instanceof Response) return p
  try {
    return c.json(await execute(c, p))
  } catch (e) {
    if (e instanceof PaperworkError) {
      const { status, error } = toApiError(e)
      console.error('run failed', p.id, error.step, error.code, error.message)
      return c.json({ error } satisfies ApiError, status)
    }
    throw e
  }
})

/** The same run, with progress. The browser shows each step as it starts. */
function streamRun(c: Context<Env>, input: SampleInput) {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const enc = new TextEncoder()
  const send = (ev: RunEvent) => writer.write(enc.encode(`${JSON.stringify(ev)}\n`)).catch(() => {})
  const work = (async () => {
    try {
      const result = await execute(c, input, (step) => void send({ type: 'step', step }))
      await send({ type: 'result', result })
    } catch (e) {
      const error: ApiError['error'] =
        e instanceof PaperworkError
          ? toApiError(e).error
          : { code: 'internal', message: 'Something went wrong. Try again.', retryable: true }
      console.error('run failed', input.id, error.step, error.code, error.message)
      await send({ type: 'error', error })
    } finally {
      await writer.close().catch(() => {})
    }
  })()
  c.executionCtx.waitUntil(work)
  return new Response(readable, {
    headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' },
  })
}

app.post('/run/stream', async (c) => {
  const p = await prepareRun(c)
  if (p instanceof Response) return p
  return streamRun(c, p)
})

// A file the user sent. The worker keeps nothing, and logs no file name: the name can hold a patient name.
app.post('/upload/stream', async (c) => {
  const stop = await checkLive(c)
  if (stop) return stop
  const tooLarge = () => fail(c, 413, 'too_large', `The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`)
  // The form adds a little to the file size.
  if (Number(c.req.header('content-length') ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) return tooLarge()
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    return fail(c, 400, 'bad_request', 'Send a multipart form with a file.')
  }
  const file = form.get('file')
  if (!(file instanceof File)) return fail(c, 400, 'bad_request', 'Send a multipart form with a file.')
  if (file.size > MAX_UPLOAD_BYTES) return tooLarge()
  const bytes = await file.arrayBuffer()
  const type = sniffFile(new Uint8Array(bytes))
  if (!type) return fail(c, 415, 'unsupported_file', 'Send a PDF, PNG or JPEG file.')
  const pages = Number(form.get('pages'))
  // The browser counts the pages. This is a guard and a cost estimate. The demo code is the real gate.
  if (!Number.isInteger(pages) || pages < 1 || pages > MAX_UPLOAD_PAGES) {
    return fail(c, 400, 'bad_request', `Send from 1 to ${MAX_UPLOAD_PAGES} pages.`)
  }
  return streamRun(c, {
    id: 'upload',
    name: `upload.${type.ext}`,
    mimeType: type.mimeType,
    bytes,
    pages,
    ocr: form.get('scanned') === '1',
    truthMd: null,
  })
})

export default app
