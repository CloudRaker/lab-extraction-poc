// The extraction and classification config sent to the paperwork API.
// The schema respects the narrow /v1 dialect: root object, no $ref, oneOf,
// anyOf, allOf, const or pattern, nesting depth 5 or less, nullable primitives.

const str = (description: string) => ({ type: ['string', 'null'], description })
const num = (description: string) => ({ type: ['number', 'null'], description })

export const LAB_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    lab_name: str('Name of the laboratory or facility that issued the report.'),
    patient_name: str('Patient full name, as printed (for example "LAST, First").'),
    health_insurance_number: str('Health insurance number (for example a RAMQ number), as printed.'),
    date_of_birth: str('Patient date of birth, as printed (ISO format when the page uses it).'),
    sex: str('Patient sex, as printed (for example F, M or X).'),
    ordering_physician: str('Name of the ordering physician, with the licence number if printed.'),
    collected_at: str('Date and time the specimen was collected, as printed.'),
    reported_at: str('Date and time the report was issued, as printed.'),
    report_status: {
      type: ['string', 'null'],
      enum: ['final', 'preliminary', 'amended', null],
      description: 'Status printed on the report. Null when no status is printed. The document title is not a status.',
    },
    results: {
      type: 'array',
      description:
        'Every test result row of the current report, in page order. Do not include section heading rows or previous results columns.',
      items: {
        type: 'object',
        properties: {
          section: str('Section or panel heading the row is under, for example "Complete Blood Count (CBC)".'),
          test_name: str('Test or analyte name, verbatim.'),
          value: str('Current result, verbatim as printed (keep a decimal comma, keep text results like "Negative").'),
          numeric_value: num('The current result as a number (decimal comma converted to a dot). Null for text results.'),
          flag: str('Abnormal flag as printed, for example *, **, H, L, HH. Null when the flag cell is empty.'),
          units: str('Units of the result, verbatim (for example mmol/L, x10^9/L). Null when no units are printed.'),
          reference_low: num('Lower bound of the reference range as a number, if any.'),
          reference_high: num('Upper bound of the reference range as a number, if any.'),
          reference_text: str('Reference range verbatim as printed, for example "3.5 – 5.0" or "< 5.0" or "Negative".'),
          abnormal: {
            type: ['boolean', 'null'],
            description: 'True when the row has an abnormal or critical flag, false when the flag cell is empty.',
          },
        },
      },
    },
  },
} as const

export const LAB_REPORT_INSTRUCTIONS = [
  'The report can be in French, English or both. Keep values verbatim, in the language of the page.',
  'A decimal comma is allowed in "value" and "reference_text". Convert it to a dot only in numeric fields.',
  'Extract only the current result. Ignore "Previous results / Résultats antérieurs" columns.',
  'When units and the reference interval share one column (for example "135 – 145 mmol/L"), split them: units go to "units", the interval to "reference_text".',
  'Section heading rows are not results: put the heading in "section" of the rows below it.',
  'Stamps and handwritten notes (for example "COPIE" or "ok - DS") are not part of a value or a range. Leave them out.',
].join('\n')

export const CLASSES = [
  {
    id: 'lab_report',
    description:
      'A laboratory report: a table of test results (analytes) with values, abnormal flags, units and reference ranges, for one patient.',
  },
  {
    id: 'prescription',
    description: 'A prescription: medications with dose, route, frequency and quantity, signed by a prescriber.',
  },
  {
    id: 'consult_note',
    description:
      'A consultation note or letter from a specialist: reason for referral, history, examination, impression and plan.',
  },
  {
    id: 'discharge_summary',
    description:
      'A hospital discharge summary: admission and discharge dates, diagnoses, hospital course, discharge medications and follow-up.',
  },
  { id: 'other', description: 'Any other document that does not fit the classes above.' },
] as const

export type ClassId = (typeof CLASSES)[number]['id']

export const CLASSIFY_INSTRUCTIONS =
  'Documents come from a Canadian virtual-care clinic and can be in French or English. A page with a results table and reference ranges is a lab report, even when it carries a short clinical comment.'
