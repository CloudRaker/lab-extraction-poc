// Hono API for the browser. Every route is same-origin under /api.
// The worker holds PAPERWORK_API_KEY; the browser never sees it.
// Contract types: src/shared/contract.ts.

import { Hono, type Context } from 'hono'

import { loadRates } from './cost'
import { PaperworkError } from './paperwork'
import { OPTIONS, StepError, runSample } from './pipeline'

import type { ApiError, AppConfig, RunRequest, SampleInfo } from '../shared/contract'

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

app.notFound((c) => fail(c, 404, 'not_found', 'No such API route.'))

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

app.post('/run', async (c) => {
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

  try {
    const result = await runSample(
      { apiBase: c.env.API_BASE, apiKey: c.env.PAPERWORK_API_KEY },
      { id: s.id, name: s.file, mimeType: s.mime, bytes: await file.arrayBuffer(), truthMd: pageMd },
      await loadRates(c.env.CATALOG_URL),
    )
    return c.json(result)
  } catch (e) {
    if (e instanceof PaperworkError) {
      const step = e instanceof StepError ? e.step : undefined
      const runId = e instanceof StepError ? e.runId : undefined
      const status = e.code === 'timeout' ? 504 : 502
      console.error('run failed', s.id, step, e.code, e.message)
      return fail(c, status, e.code === 'timeout' ? 'timeout' : e.code, e.message, {
        retryable: e.retryable,
        ...(step ? { step } : {}),
        ...(runId ? { runId } : {}),
      })
    }
    throw e
  }
})

export default app
