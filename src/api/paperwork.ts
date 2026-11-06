// Minimal client for the paperwork /v1 API. Runs in the worker and in Node.

export interface PaperworkConfig {
  apiBase: string // https://api.cloudraker.com
  apiKey: string
  /** Per-request timeout. A long poll (wait=20) needs more than 20 s. */
  timeoutMs?: number
  /** Wait between poll retries. The tests set it to 0. */
  retryDelayMs?: number
}

export class PaperworkError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable: boolean,
  ) {
    super(message)
  }
}

export type Run = Record<string, unknown> & {
  id: string
  status: string
  output?: Record<string, unknown>
  usage?: Record<string, number>
  error?: { code: string; message: string }
}

export const TERMINAL = new Set(['processed', 'failed', 'cancelled', 'expired', 'needs_input'])

async function call<T>(
  cfg: PaperworkConfig,
  path: string,
  init: RequestInit = {},
  timeoutMs = cfg.timeoutMs ?? 45_000,
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${cfg.apiKey}`)
  if (typeof init.body === 'string') headers.set('content-type', 'application/json')
  let res: Response
  try {
    res = await fetch(`${cfg.apiBase}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    const timeout = (e as Error).name === 'TimeoutError'
    throw new PaperworkError(504, timeout ? 'timeout' : 'network_error', String(e), true)
  }
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { message: text.slice(0, 300) }
  }
  if (!res.ok) {
    const b = body as { code?: string; message?: string; error?: { code?: string; message?: string } }
    const code = b.code ?? b.error?.code ?? 'upstream_error'
    const message = b.message ?? b.error?.message ?? `upstream ${res.status}`
    throw new PaperworkError(res.status, code, `${path}: ${message}`, res.status >= 500 || res.status === 429)
  }
  return body as T
}

/** POST /v1/files, then PUT the bytes to the signed upload URL. */
export async function uploadFile(
  cfg: PaperworkConfig,
  file: { name: string; mimeType: string; bytes: ArrayBuffer | Uint8Array },
): Promise<string> {
  const created = await call<{ id: string; uploadUrl: string }>(cfg, '/v1/files', {
    method: 'POST',
    body: JSON.stringify({ name: file.name, mimeType: file.mimeType }),
  })
  let put: Response
  try {
    put = await fetch(created.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.mimeType },
      body: file.bytes as BodyInit,
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 45_000),
    })
  } catch (e) {
    throw new PaperworkError(504, 'upload_failed', `upload PUT: ${String(e)}`, true)
  }
  if (!put.ok) throw new PaperworkError(502, 'upload_failed', `upload PUT ${put.status}`, true)
  return created.id
}

/**
 * POST /v1/{verb}. The gateway can hold the request open until the run ends
 * (an extract on a parsed file answers `processed`), so the timeout follows the
 * pipeline deadline, not the short per-request default.
 */
export const startRun = (
  cfg: PaperworkConfig,
  verb: 'classify' | 'extract',
  body: unknown,
  deadline: number,
) =>
  call<Run>(
    cfg,
    `/v1/${verb}`,
    { method: 'POST', body: JSON.stringify(body) },
    Math.max(5_000, deadline - Date.now()),
  )

const POLL_RETRIES = 4
const POLL_TIMEOUT_MS = 45_000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Long-poll GET /v1/runs/{id}?wait=20 until terminal or until the deadline.
 * A failed poll does not end the run on the API, so a retryable failure polls again.
 */
export async function waitRun(cfg: PaperworkConfig, first: Run, deadline: number): Promise<Run> {
  let run = first
  let failures = 0
  while (!TERMINAL.has(run.status)) {
    const left = deadline - Date.now()
    if (left <= 0)
      throw new PaperworkError(504, 'timeout', `run ${run.id} still ${run.status} at the deadline`, true)
    const wait = Math.max(1, Math.min(20, Math.floor(left / 1000)))
    const timeout = Math.min(POLL_TIMEOUT_MS, Math.max(left, wait * 1000) + 5_000)
    try {
      // oxlint-disable-next-line no-await-in-loop -- polling is sequential by nature
      run = await call<Run>(cfg, `/v1/runs/${run.id}?wait=${wait}&output=inline`, {}, timeout)
      failures = 0
    } catch (e) {
      failures++
      if (!(e instanceof PaperworkError && e.retryable) || failures > POLL_RETRIES) throw e
      // oxlint-disable-next-line no-await-in-loop -- back off before the next poll
      await sleep(cfg.retryDelayMs ?? failures * 1000)
    }
  }
  return run
}

/** GET a run once with inline output. The POST and poll answers can omit the output. */
export const getRun = (cfg: PaperworkConfig, id: string) =>
  call<Run>(cfg, `/v1/runs/${id}?output=inline`)

/** Best effort: the demo does not keep files. */
export async function deleteFile(cfg: PaperworkConfig, id: string): Promise<void> {
  try {
    await call(cfg, `/v1/files/${id}`, { method: 'DELETE' }, 5_000)
  } catch {
    /* ignore */
  }
}
