import { describe, expect, it } from 'vitest'

import app, { sniffFile } from './app'

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

describe('upload route', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
  const send = (form: FormData, code?: string) =>
    app.request(
      'https://poc.workers.dev/api/upload/stream',
      { method: 'POST', headers: code ? { 'x-demo-code': code } : {}, body: form },
      env({ PAPERWORK_API_KEY: 'k', DEMO_CODE: 'c' }) as never,
    )
  const form = (bytes: Uint8Array<ArrayBuffer>, pages: string) => {
    const f = new FormData()
    f.set('file', new File([bytes], 'patient-name.pdf'))
    f.set('pages', pages)
    return f
  }

  it('asks for the demo code before it reads the file', async () => {
    const res = await send(form(pdf, '1'))
    expect(res.status).toBe(401)
  })
  it('refuses a file that is not a PDF, PNG or JPEG, whatever its name says', async () => {
    const res = await send(form(new Uint8Array([1, 2, 3, 4, 5, 6]), '1'), 'c')
    expect(res.status).toBe(415)
  })
  it('refuses a page count over the limit', async () => {
    const res = await send(form(pdf, '6'), 'c')
    expect(res.status).toBe(400)
  })
  it('knows the file types by their first bytes', () => {
    expect(sniffFile(pdf)?.mimeType).toBe('application/pdf')
    expect(sniffFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mimeType).toBe('image/jpeg')
    expect(sniffFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mimeType).toBe('image/png')
    expect(sniffFile(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull()
  })
})
