import { afterEach, describe, expect, it, vi } from 'vitest'

import { waitRun, type PaperworkConfig, type Run } from './paperwork'
import { runSample } from './pipeline'

const cfg: PaperworkConfig = { apiBase: 'https://api.test', apiKey: 'k', retryDelayMs: 0 }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const later = () => Date.now() + 60_000

afterEach(() => vi.unstubAllGlobals())

describe('waitRun', () => {
  const first: Run = { id: 'r1', status: 'processing' }

  it('polls again after a failed poll', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ message: 'busy' }, 503))
      .mockResolvedValueOnce(json({ id: 'r1', status: 'processed', output: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(waitRun(cfg, first, later())).resolves.toMatchObject({ status: 'processed' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops after repeated failures', async () => {
    const fetchMock = vi.fn(async () => json({ message: 'busy' }, 503))
    vi.stubGlobal('fetch', fetchMock)
    await expect(waitRun(cfg, first, later())).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('does not retry a client error', async () => {
    const fetchMock = vi.fn(async () => json({ message: 'gone' }, 404))
    vi.stubGlobal('fetch', fetchMock)
    await expect(waitRun(cfg, first, later())).rejects.toMatchObject({ status: 404 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('runSample', () => {
  const rates = { rates: {}, creditUsd: 0.001, source: 'fallback' as const }
  const input = { id: 's', name: 's.jpg', mimeType: 'image/jpeg', bytes: new Uint8Array(1) }
  const api = (classify: () => Response) =>
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/v1/files') && init?.method === 'POST') return json({ id: 'f', uploadUrl: 'https://up.test/x' })
      if (url.startsWith('https://up.test')) return new Response(null, { status: 200 })
      if (init?.method === 'DELETE') return json({})
      return classify()
    })

  it('fails the step when a processed run has no output', async () => {
    vi.stubGlobal('fetch', api(() => json({ id: 'c', status: 'processed', usage: { pages: 1 } })))
    await expect(runSample(cfg, input, rates)).rejects.toMatchObject({ code: 'no_output', step: 'classify', runId: 'c' })
  })

  it('reads the run again to get the output', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      api(() => {
        calls++
        return calls === 1
          ? json({ id: 'c', status: 'processed' })
          : json({ id: 'c', status: 'processed', output: { classId: 'prescription', confidence: 5 } })
      }),
    )
    await expect(runSample(cfg, input, rates)).resolves.toMatchObject({ classification: { classId: 'prescription' } })
  })
})
