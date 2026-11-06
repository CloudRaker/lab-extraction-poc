// Writes public/samples/index.json from the synthdocs JSON files in public/samples.
// Run: pnpm tsx scripts/build-index.ts

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

import type { SampleInfo } from '../src/shared/contract'

const dir = new URL('../public/samples/', import.meta.url)

const PRESETS: Record<string, string> = {
  clean: 'clean print',
  scan_300dpi: 'flatbed scan',
  scan_skewed: 'skewed scan',
  fax_1bit: '1-bit fax',
  fax_2bit: '2-bit fax',
  fax_dither: 'dithered fax',
  photo_phone: 'phone photo',
  photo_blurry: 'blurry photo',
  crumpled: 'crumpled paper',
  coffee_stain: 'coffee stain',
  photocopy_gen3: 'third-generation photocopy',
  lowres_jpeg: 'low-resolution JPEG',
  bleedthrough: 'ink bleed-through',
  dirty: 'dirty page',
  screenshot_moire: 'screen photo',
  dot_matrix: 'dot-matrix print',
  thermal: 'thermal paper',
}
const DOCTYPES: Record<string, string> = {
  lab_report: 'Lab report',
  prescription: 'Prescription',
  consult_note: 'Consult note',
  discharge_summary: 'Discharge summary',
}
const LANGS: Record<string, string> = { fr: 'French', en: 'English' }

const order = (s: SampleInfo) => [s.doctype === 'lab_report' ? 0 : 1, s.lang === 'fr' ? 0 : 1, s.id].join('|')

const samples: SampleInfo[] = readdirSync(dir)
  .filter((f) => /^\d+_\d+\.json$/.test(f))
  .map((f) => {
    const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as {
      id: string
      lang: 'fr' | 'en'
      preset: string
      doctype: string
      width: number
      height: number
    }
    return {
      id: d.id,
      title: `${DOCTYPES[d.doctype] ?? d.doctype}, ${LANGS[d.lang]}, ${PRESETS[d.preset] ?? d.preset}`,
      lang: d.lang,
      preset: d.preset,
      doctype: d.doctype,
      file: `${d.id}.jpg`,
      mime: 'image/jpeg',
      image: `${d.id}.webp`,
      width: d.width,
      height: d.height,
      hasResult: existsSync(new URL(`results/${d.id}.json`, dir)),
    }
  })
  .sort((a, b) => order(a).localeCompare(order(b)))

writeFileSync(new URL('index.json', dir), JSON.stringify(samples, null, 2) + '\n')
console.log(`wrote ${samples.length} samples`)
