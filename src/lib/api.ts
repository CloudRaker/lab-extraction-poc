// Browser client for the same-origin /api routes. Types: src/shared/contract.ts.

import type { UploadedFile } from './upload'
import type { ApiError, AppConfig, RunEvent, RunResult, SampleInfo } from '@/shared/contract'

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public body: ApiError['error'],
  ) {
    super(body.message)
  }
}

async function json<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T
  let body: ApiError['error'] = { code: 'http_' + res.status, message: res.statusText, retryable: res.status >= 500 }
  try {
    body = ((await res.json()) as ApiError).error ?? body
  } catch {
    // keep the status text
  }
  throw new ApiFailure(res.status, body)
}

export const getConfig = () => fetch('/api/config').then((r) => json<AppConfig>(r))
export const getSamples = () => fetch('/api/samples').then((r) => json<SampleInfo[]>(r))
export const getSavedResult = (id: string) =>
  fetch(`/api/samples/${encodeURIComponent(id)}/result`).then((r) => json<RunResult>(r))

/**
 * Starts a live run on a sample or on the user's file, and reports each step as the worker starts it.
 * Resolves with the result. Rejects with ApiFailure (status 401 means the demo code is missing or wrong).
 */
export async function runLive(
  target: { sampleId: string } | { upload: UploadedFile },
  demoCode: string | null,
  onStep: (step: 'upload' | 'classify' | 'extract') => void,
  signal?: AbortSignal,
): Promise<RunResult> {
  const code = demoCode ? { 'x-demo-code': demoCode } : undefined
  let res: Response
  if ('upload' in target) {
    const form = new FormData()
    form.set('file', target.upload.file)
    form.set('pages', String(target.upload.pages.length))
    if (target.upload.scanned) form.set('scanned', '1')
    res = await fetch('/api/upload/stream', { method: 'POST', headers: code, body: form, signal })
  } else {
    res = await fetch('/api/run/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...code },
      body: JSON.stringify({ sampleId: target.sampleId }),
      signal,
    })
  }
  if (!res.ok || !res.body) return json<RunResult>(res)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffer += value
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      const ev = JSON.parse(line) as RunEvent
      if (ev.type === 'step') onStep(ev.step)
      else if (ev.type === 'result') return ev.result
      else throw new ApiFailure(502, ev.error)
    }
    if (done) break
  }
  throw new ApiFailure(502, {
    code: 'stream_ended',
    message: 'The connection closed before the run finished. Try again.',
    retryable: true,
  })
}
