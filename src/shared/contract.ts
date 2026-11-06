// Browser <-> worker contract for every /api route.
// The browser calls only same-origin /api/*. The worker holds the API key.

import type { ClassId } from './lab-schema'

/** GET /api/samples -> SampleInfo[] */
export interface SampleInfo {
  id: string // synthdocs page id, for example "1001_000434"
  title: string // short label for the picker
  lang: 'fr' | 'en'
  preset: string // synthdocs damage preset: clean, scan_300dpi, fax_1bit, photo_phone, ...
  doctype: string // ground-truth doctype: lab_report, prescription, consult_note, ...
  file: string // file sent to the API, under /samples/ (JPEG)
  mime: string // mime type of `file`
  image: string // display image, under /samples/ (WebP, same pixels as `file`)
  width: number // page pixel width (1700)
  height: number // page pixel height (2200)
  hasResult: boolean // a cached result exists for GET /api/samples/:id/result
}

// GET /api/samples/:id/image -> the display image bytes (image/webp).

/** One line of the credit estimate. */
export interface CostLine {
  event: string // metering event slug, for example page_ocr
  units: number
  rate: number // credits per unit (Pro plan)
  credits: number
  reason: string // why this event counts, in plain words
}

export interface Cost {
  credits: number
  usd: number // credits x creditUsd
  creditUsd: number // 0.001
  ratesSource: 'catalog' | 'fallback'
  lines: CostLine[]
  estimate: true // runs carry no credits: this is computed from usage and the rate card
}

/** One cited location on the page. bbox is normalized (0..1) to the page. */
export interface Citation {
  fileId: string
  page?: number // 0-based in practice (the API returns page 0 for a one-page image)
  bbox?: { x: number; y: number; width: number; height: number }
  text?: string
  confidence?: number // 0..5, only with judge: true
  notFound?: boolean
  uncited?: boolean
}

export interface LabResultRow {
  section: string | null
  test_name: string | null
  value: string | null
  numeric_value: number | null
  flag: string | null
  units: string | null
  reference_low: number | null
  reference_high: number | null
  reference_text: string | null
  abnormal: boolean | null
}

export interface LabReport {
  lab_name: string | null
  patient_name: string | null
  health_insurance_number: string | null
  date_of_birth: string | null
  sex: string | null
  ordering_physician: string | null
  collected_at: string | null
  reported_at: string | null
  report_status: string | null
  results: LabResultRow[] | null
}

export interface Classification {
  classId: ClassId | string
  confidence: number | null // 0..5
  reasoning: string | null
}

export interface Extraction {
  value: LabReport
  /** Keyed by top-level field. "results" holds table-level boxes, not one box per row. */
  citations: Record<string, Citation[]>
}

/** Score of the extraction against the synthdocs ground truth. */
export interface RowScore {
  test: string // ground-truth test name
  expected: { value: string; flag: string | null; units: string | null }
  found: { test: string | null; value: string | null; flag: string | null; units: string | null } | null
  nameOk: boolean // the extracted test name matches exactly (after accent and case folding)
  valueOk: boolean
  flagOk: boolean
  unitsOk: boolean
}

export interface Score {
  rowsExpected: number
  rowsFound: number // ground-truth rows matched by test name (exact, contained, or within a small edit distance)
  rowsExtracted: number // rows the model returned
  valuesCorrect: number
  flagsCorrect: number
  unitsCorrect: number
  perRow: RowScore[]
  extraRows: string[] // extracted test names with no ground-truth match
}

export interface Timings {
  uploadMs: number // POST /v1/files + PUT bytes
  classifyMs: number // POST /v1/classify until terminal (includes parse/OCR when the file is fresh)
  extractMs: number | null // POST /v1/extract until terminal, null when skipped
  totalMs: number
}

/** POST /api/run response and GET /api/samples/:id/result body. */
export interface RunResult {
  sampleId: string
  ranAt: string // ISO time
  apiBase: string
  fileId: string
  runs: { classify: string; extract: string | null }
  classification: Classification
  extraction: Extraction | null // null when the class is not lab_report
  extractSkipped: string | null // why extract did not run
  usage: { classify: Record<string, number> | null; extract: Record<string, number> | null }
  cost: Cost
  timings: Timings
  score: Score | null // null when the sample is not a lab report
}

/** POST /api/run request body. Header x-demo-code is required when DEMO_CODE is set. */
export interface RunRequest {
  sampleId: string
}

/**
 * POST /api/run/stream: the same request and checks as POST /api/run. A check that
 * fails answers with an ApiError status and body. Otherwise the answer is 200 with
 * NDJSON (application/x-ndjson): one RunEvent per line, and the last line is a
 * result or an error event.
 */
export type RunEvent =
  | { type: 'step'; step: 'upload' | 'classify' | 'extract' }
  | { type: 'result'; result: RunResult }
  | { type: 'error'; error: ApiError['error'] }

/** Every error body. */
export interface ApiError {
  error: {
    code: string // not_found | bad_request | demo_code_required | upstream_error | timeout | run_failed | internal
    message: string
    retryable: boolean
    step?: 'upload' | 'classify' | 'extract'
    runId?: string
  }
}

/** GET /api/config -> what the UI needs to render cost and options. */
export interface AppConfig {
  demoCodeRequired: boolean
  creditUsd: number
  rates: Record<string, number>
  ratesSource: 'catalog' | 'fallback'
  judge: boolean
}
