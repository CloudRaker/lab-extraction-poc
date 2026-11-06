// Runs every sample live against the paperwork API, through the same pipeline
// as POST /api/run, and writes public/samples/results/<id>.json.
//
//   pnpm run-samples                 # all samples
//   pnpm run-samples 1001_000065     # some samples
//   pnpm run-samples --rescore       # recompute scores of saved results, no API calls
//
// Reads PAPERWORK_API_KEY (and optional API_BASE, CATALOG_URL) from the
// environment or from .dev.vars.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

import { loadRates } from '../src/api/cost'
import { StepError, runSample } from '../src/api/pipeline'
import { parseTruth, score } from '../src/shared/score'

import type { RunResult, SampleInfo } from '../src/shared/contract'

const root = new URL('../', import.meta.url)
const samplesDir = new URL('public/samples/', root)

function devVars(): Record<string, string> {
  const file = new URL('.dev.vars', root)
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1]!, m[2]!]),
  )
}

const index = JSON.parse(readFileSync(new URL('index.json', samplesDir), 'utf8')) as SampleInfo[]
const args = process.argv.slice(2)

if (args.includes('--rescore')) {
  for (const s of index) {
    const file = new URL(`results/${s.id}.json`, samplesDir)
    if (!existsSync(file)) continue
    const r = JSON.parse(readFileSync(file, 'utf8')) as RunResult
    const truth = JSON.parse(readFileSync(new URL(`${s.id}.json`, samplesDir), 'utf8')) as {
      page_md: string
      doctype: string
    }
    if (truth.doctype === 'lab_report') r.score = score(parseTruth(truth.page_md), r.extraction?.value.results)
    writeFileSync(file, JSON.stringify(r, null, 2) + '\n')
    const sc = r.score
    if (sc) console.log(s.id, `rows ${sc.rowsFound}/${sc.rowsExpected} values ${sc.valuesCorrect} flags ${sc.flagsCorrect} units ${sc.unitsCorrect}`)
  }
  process.exit(0)
}

const vars = { ...devVars(), ...process.env } as Record<string, string | undefined>
const apiKey = vars['PAPERWORK_API_KEY']
if (!apiKey) {
  console.error('PAPERWORK_API_KEY is not set (environment or .dev.vars).')
  process.exit(1)
}
const cfg = { apiBase: vars['API_BASE'] ?? 'https://api.cloudraker.com', apiKey }
const catalogUrl = vars['CATALOG_URL'] ?? 'https://catalog.cloudraker.com/catalog.json'

const wanted = args
const todo = wanted.length ? index.filter((s) => wanted.includes(s.id)) : index
const CONCURRENCY = 3

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-')

async function one(s: SampleInfo): Promise<RunResult | null> {
  const truth = JSON.parse(readFileSync(new URL(`${s.id}.json`, samplesDir), 'utf8')) as {
    page_md: string
    doctype: string
  }
  const bytes = readFileSync(new URL(s.file, samplesDir))
  const rates = await loadRates(catalogUrl)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one retry on a retryable error
      const r = await runSample(
        cfg,
        {
          id: s.id,
          name: s.file,
          mimeType: s.mime,
          bytes,
          truthMd: truth.doctype === 'lab_report' ? truth.page_md : null,
        },
        rates,
      )
      writeFileSync(new URL(`results/${s.id}.json`, samplesDir), JSON.stringify(r, null, 2) + '\n')
      const sc = r.score
      console.log(
        [
          s.id.padEnd(12),
          s.doctype.padEnd(18),
          `-> ${r.classification.classId} (${r.classification.confidence ?? '-'})`.padEnd(24),
          `${r.cost.credits} cr`.padEnd(7),
          `${(r.timings.totalMs / 1000).toFixed(1)} s`.padEnd(8),
          sc
            ? `rows ${sc.rowsFound}/${sc.rowsExpected} values ${pct(sc.valuesCorrect, sc.rowsExpected)} flags ${pct(sc.flagsCorrect, sc.rowsExpected)} units ${pct(sc.unitsCorrect, sc.rowsExpected)}`
            : '',
        ].join(' '),
      )
      return r
    } catch (e) {
      const msg = e instanceof StepError ? `${e.step} ${e.code} ${e.message} ${e.runId ?? ''}` : String(e)
      console.error(`${s.id} attempt ${attempt} failed: ${msg}`)
      if (!(e instanceof StepError && e.retryable) || attempt === 2) return null
    }
  }
  return null
}

const results: Array<RunResult | null> = []
for (let i = 0; i < todo.length; i += CONCURRENCY) {
  // oxlint-disable-next-line no-await-in-loop -- small batches keep the API load low
  results.push(...(await Promise.all(todo.slice(i, i + CONCURRENCY).map(one))))
}

execFileSync('npx', ['tsx', new URL('scripts/build-index.ts', root).pathname], { stdio: 'inherit' })

const failed = todo.filter((_, i) => !results[i]).map((s) => s.id)
if (failed.length) {
  console.error(`failed: ${failed.join(', ')}`)
  process.exit(1)
}
