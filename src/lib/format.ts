// Plain-word labels for the codes the API and the dataset use.

const PRESETS: Record<string, string> = {
  clean: 'Clean print',
  scan_300dpi: 'Flatbed scan',
  fax_1bit: 'Fax',
  fax_dither: 'Dithered fax',
  photo_phone: 'Phone photo',
  crumpled: 'Crumpled',
  coffee_stain: 'Coffee stain',
}
export const presetLabel = (p: string) => PRESETS[p] ?? sentence(p)

const DOCTYPES: Record<string, string> = {
  lab_report: 'Lab report',
  prescription: 'Prescription',
  consult_note: 'Consult note',
  discharge_summary: 'Discharge summary',
  intake_form: 'Intake form',
  other: 'Other',
}
export const doctypeLabel = (d: string) => DOCTYPES[d] ?? sentence(d)

const EVENTS: Record<string, string> = {
  page_parsed: 'Parse',
  page_ocr: 'OCR',
  page_classified: 'Classify',
  page_extracted: 'Extract',
  extraction_grounding: 'Citations',
  page_judged: 'Judge',
}
export const eventLabel = (e: string) => EVENTS[e] ?? sentence(e)

export const langLabel = (l: string) => (l === 'fr' ? 'French' : l === 'en' ? 'English' : l)

function sentence(code: string) {
  const s = code.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Words for a flag printed on a report. */
export function flagLabel(flag: string | null, abnormal: boolean | null): string | null {
  const f = flag?.trim()
  if (!f) return abnormal ? 'Abnormal' : null
  const known: Record<string, string> = { H: 'High', L: 'Low', HH: 'Very high', LL: 'Very low', A: 'Abnormal' }
  return known[f.toUpperCase()] ?? `Abnormal (${f})`
}

/** Samples with a note the demo should show. */
export const SAMPLE_NOTES: Record<string, { tone: 'warning' | 'info'; title: string; body: string; badge?: string }> = {
  '1001_000141': {
    tone: 'warning',
    badge: 'Hard case',
    title: 'Hard case',
    body: 'Dither noise on this fax hides many digits. The OCR misreads some values and test names, so this page scores lower than the others.',
  },
  '1002_004107': {
    tone: 'info',
    title: 'Previous results on the page',
    body: 'This report also prints the previous results. The extraction keeps only the current values.',
  },
  '1003_001515': {
    tone: 'info',
    title: 'Previous results on the page',
    body: 'This report also prints the previous results. The extraction keeps only the current values.',
  },
}

export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

const dateFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
export const shortDate = (iso: string) => dateFmt.format(new Date(iso))
