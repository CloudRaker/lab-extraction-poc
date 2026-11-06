// Credit estimate. Runs report usage (pages), not credits, so the cost is
// computed from usage and the Pro plan rate card, like the CloudRaker playground.

import type { Cost, CostLine } from '../shared/contract'

export const CREDIT_USD = 0.001

// Pro plan rates from https://catalog.cloudraker.com/catalog.json (read 2026-11-06).
// Used only when the catalog cannot be fetched.
export const FALLBACK_RATES: Record<string, number> = {
  page_parsed: 2,
  page_ocr: 10,
  page_classified: 10,
  page_extracted: 15,
  extraction_grounding: 5,
  page_judged: 5,
}

export interface Rates {
  rates: Record<string, number>
  creditUsd: number
  source: 'catalog' | 'fallback'
}

let cache: { value: Rates; at: number } | undefined
const TTL_MS = 5 * 60_000

/** Pro plan credits per event slug. 5 minute cache, stale on error. */
export async function loadRates(catalogUrl: string | undefined): Promise<Rates> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  if (!catalogUrl) return { rates: FALLBACK_RATES, creditUsd: CREDIT_USD, source: 'fallback' }
  try {
    const res = await fetch(catalogUrl, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error(`catalog ${res.status}`)
    const body = (await res.json()) as {
      creditUsd?: number
      catalog?: { plans?: Record<string, Record<string, { credits?: number } | string>> }
    }
    const pro = body.catalog?.plans?.['Pro'] ?? {}
    const rates: Record<string, number> = { ...FALLBACK_RATES }
    for (const [slug, v] of Object.entries(pro)) {
      if (typeof v === 'object' && typeof v.credits === 'number') rates[slug] = v.credits
    }
    const creditUsd = typeof body.creditUsd === 'number' ? body.creditUsd : CREDIT_USD
    cache = { value: { rates, creditUsd, source: 'catalog' }, at: Date.now() }
  } catch (e) {
    console.warn('catalog fetch failed, using fallback rates', String(e))
    cache ??= { value: { rates: FALLBACK_RATES, creditUsd: CREDIT_USD, source: 'fallback' }, at: 0 }
  }
  return cache.value
}

export type Units = Array<[event: string, units: number, reason: string]>

export function cost(r: Rates, units: Units): Cost {
  const lines: CostLine[] = units
    .filter(([, n]) => n > 0)
    .map(([event, n, reason]) => {
      const rate = r.rates[event] ?? 0
      return { event, units: n, rate, credits: n * rate, reason }
    })
  const credits = lines.reduce((s, l) => s + l.credits, 0)
  return {
    credits,
    usd: Math.round(credits * r.creditUsd * 1e6) / 1e6,
    creditUsd: r.creditUsd,
    ratesSource: r.source,
    lines,
    estimate: true,
  }
}

/**
 * The events one sample run bills, and why.
 * - Parse: an image page always goes through OCR (rakedoc), so it bills page_ocr
 *   instead of page_parsed. A PDF with a text layer bills page_parsed, and a scanned PDF
 *   (ocr: true) bills page_ocr. This is an estimate: the API does not report which ran.
 * - Classify: page_classified for each page sent to the model (usage.pages).
 * - Extract: page_extracted per page, plus extraction_grounding (citations: true)
 *   and page_judged (judge: true) for the passes that ran.
 */
export function runUnits(opts: {
  mimeType: string
  ocr?: boolean
  pages: number
  classified: number
  extracted: number
  citations: boolean
  judge: boolean
}): Units {
  const image = opts.mimeType.startsWith('image/')
  const u: Units = [
    image || opts.ocr
      ? ['page_ocr', opts.pages, `The ${image ? 'page is an image' : 'PDF has no text layer'}, so parsing runs OCR (rakedoc).`]
      : ['page_parsed', opts.pages, 'The file is parsed once on upload.'],
    ['page_classified', opts.classified, 'Each page sent to the classifier.'],
  ]
  if (opts.extracted > 0) {
    u.push(['page_extracted', opts.extracted, 'Each page read by the extraction.'])
    if (opts.citations)
      u.push(['extraction_grounding', opts.extracted, 'Citations: each value is linked to its place on the page.'])
    if (opts.judge && opts.citations)
      u.push(['page_judged', opts.extracted, 'Judge pass: each cited value gets a confidence score.'])
  }
  return u
}
