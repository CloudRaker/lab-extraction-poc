import { describe, expect, it } from 'vitest'

import app from './app'

const samples = [{ id: '1001_000001', file: '1001_000001.jpg', mime: 'image/jpeg', doctype: 'prescription' }]
const assets = {
  fetch: async (req: Request) => {
    const path = new URL(req.url).pathname
    if (path === '/samples/index.json') return Response.json(samples)
    return Response.json({ page_md: '' })
  },
}
const env = (extra: object = {}) => ({ ASSETS: assets, API_BASE: 'https://api.test', ...extra })
const run = (host: string, e: object, code?: string) =>
  app.request(
    `https://${host}/api/run`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(code ? { 'x-demo-code': code } : {}) },
      body: 'not json',
    },
    e as never,
  )

describe('live run gate', () => {
  it('refuses a deployed worker with no demo code', async () => {
    const res = await run('poc.workers.dev', env({ PAPERWORK_API_KEY: 'k' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'live_runs_off' } })
    const config = await app.request('https://poc.workers.dev/api/config', {}, env() as never)
    expect(await config.json()).toMatchObject({ liveRunsOff: true, demoCodeRequired: false })
  })

  it('stays open on localhost', async () => {
    const res = await run('localhost', env({ PAPERWORK_API_KEY: 'k' }))
    expect(res.status).toBe(400) // past the gate, at the body check
  })

  it('asks for the code when one is set', async () => {
    const e = env({ PAPERWORK_API_KEY: 'k', DEMO_CODE: 'abc' })
    expect((await run('poc.workers.dev', e)).status).toBe(401)
    expect((await run('poc.workers.dev', e, 'nope')).status).toBe(401)
    expect((await run('poc.workers.dev', e, 'abc')).status).toBe(400)
  })

  it('applies the rate limit before the code check', async () => {
    const e = env({ DEMO_CODE: 'abc', RUN_LIMIT: { limit: async () => ({ success: false }) } })
    const res = await run('poc.workers.dev', e)
    expect(res.status).toBe(429)
  })
})
