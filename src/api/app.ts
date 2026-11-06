// Hono API for the browser. Every route is same-origin under /api.
// The worker holds PAPERWORK_API_KEY; the browser never sees it.
// Contract types: src/shared/contract.ts.

import { Hono, type Context } from 'hono'

import { loadRates } from './cost'
import { PaperworkError } from './paperwork'
import { OPTIONS, StepError, runSample, type RunStep } from './pipeline'

import type { ApiError, AppConfig, RunEvent, RunRequest, SampleInfo } from '../shared/contract'

type Env = { Bindings: CloudflareBindings }

const ID = /^\d{4}_\d{6}$/

function fail(
  c: Context<Env>,
  status: 400 | 401 | 404 | 500 | 502 | 504,
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

app.get('/config', async (c) => {
  const r = await loadRates(c.env.CATALOG_URL)
  const body: AppConfig = {
    demoCodeRequired: !!c.env.DEMO_CODE,
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

type Prepared = { s: SampleInfo; file: ArrayBuffer; pageMd: string | null }

/** Checks shared by both run routes. Returns the sample files, or an error response. */
async function prepareRun(c: Context<Env>): Promise<Prepared | Response> {
  if (c.env.DEMO_CODE && c.req.header('x-demo-code') !== c.env.DEMO_CODE) {
    return fail(c, 401, 'demo_code_required', 'Enter the demo code to run a live extraction.')
  }
  if (!c.env.PAPERWORK_API_KEY) {
    return fail(c, 500, 'not_configured', 'The worker has no PAPERWORK_API_KEY.')
  }
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
  const pageMd = s.doctype === 'lab_report' ? ((await truth.json()) as { page_md: string }).page_md : null
  return { s, file: await file.arrayBuffer(), pageMd }
}

async function execute(c: Context<Env>, p: Prepared, onStep?: (step: RunStep) => void) {
  return runSample(
    { apiBase: c.env.API_BASE, apiKey: c.env.PAPERWORK_API_KEY },
    { id: p.s.id, name: p.s.file, mimeType: p.s.mime, bytes: p.file, truthMd: p.pageMd },
    await loadRates(c.env.CATALOG_URL), // cached, falls back on error
    onStep,
  )
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
      console.error('run failed', p.s.id, error.step, error.code, error.message)
      return c.json({ error } satisfies ApiError, status)
    }
    throw e
  }
})

// Same run, with progress. The browser shows each step as it starts.
app.post('/run/stream', async (c) => {
  const p = await prepareRun(c)
  if (p instanceof Response) return p
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const enc = new TextEncoder()
  const send = (ev: RunEvent) => writer.write(enc.encode(`${JSON.stringify(ev)}\n`)).catch(() => {})
  const work = (async () => {
    try {
      const result = await execute(c, p, (step) => void send({ type: 'step', step }))
      await send({ type: 'result', result })
    } catch (e) {
      const error: ApiError['error'] =
        e instanceof PaperworkError
          ? toApiError(e).error
          : { code: 'internal', message: 'Something went wrong. Try again.', retryable: true }
      console.error('run failed', p.s.id, error.step, error.code, error.message)
      await send({ type: 'error', error })
    } finally {
      await writer.close().catch(() => {})
    }
  })()
  c.executionCtx.waitUntil(work)
  return new Response(readable, {
    headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' },
  })
})

export default app
