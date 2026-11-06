import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { fold, normStatus, parseTruth, parseTruthFields, sameRange, sameValue, score, scoreFields, unitsFromInterval } from './score'

import type { LabResultRow } from './contract'

const separateUnits = `
| Analyse / Test | Résultat / Result | Ind. / Flag | Unités / Units | Valeurs de référence / Reference range |
|---|---|---|---|---|
| Endocrinologie / Fer / Vitamines |  |  |  |  |
| HbA1c | 4,2 |  | % | 4,0 – 6,0 |
| TSH | 0,11 | * | mUI/L | 0,40 – 4,00 |
| RNI | 0,8 | * |  | 0,9 – 1,1 |
| Analyse d'urine |  |  |  |  |
| Glucose | Négatif |  |  | Négatif |
`

const combinedUnits = `
| Analysis / Analyse | Result / Résultat | Abn. / Anorm. | Reference interval / units / Intervalle de référence / unités | Comment / Commentaire |
|---|---|---|---|---|
| Comprehensive Metabolic Panel |  |  |  |  |
| Sodium | 144 |  | 135 – 145 mmol/L | Hémolysé |
| eGFR (CKD-EPI) | 51 | * | > 60 mL/min/1,73m² |  |
| RBC | 4.97 |  | 4.00 – 5.50 x10¹²/L | Lipémique |
| INR | 0.9 |  | 0.9 – 1.1 |  |

* Result outside reference interval.

| Analysis / Analyse | Result / Résultat | Abn. / Anorm. | Reference interval / units / Intervalle de référence / unités | Comment / Commentaire |
|---|---|---|---|---|
| Potassium | 4.2 |  | 3.5 – 5.0 mmol/L |  |
`

const previousResults = `
| Test / Analyse | Result / Résultat | Flag / Ind. | Previous results / Résultats antérieurs |  | Units / Unités | Reference range / Valeurs de référence |
|---|---|---|---|---|---|---|
|  |  |  | 2024-11-11 | 2022-12-02 |  |  |
| Urinalysis |  |  |  |  |  |  |
| Urine colour | Yellow |  | Yellow | Yellow |  | Yellow |
| MCH | 35.0 | H | 31.5 | 31.4 | pg | 27.0 – 33.0 |
`

const row = (r: Partial<LabResultRow>): LabResultRow => ({
  section: null,
  test_name: null,
  value: null,
  numeric_value: null,
  flag: null,
  units: null,
  reference_low: null,
  reference_high: null,
  reference_text: null,
  abnormal: null,
  ...r,
})

describe('parseTruth', () => {
  it('reads tables with a units column and section rows', () => {
    const t = parseTruth(separateUnits)
    expect(t.map((r) => r.test)).toEqual(['HbA1c', 'TSH', 'RNI', 'Glucose'])
    expect(t[1]).toMatchObject({ value: '0,11', flag: '*', units: 'mUI/L', section: 'Endocrinologie / Fer / Vitamines' })
    expect(t[2]!.units).toBeNull()
    expect(t[3]).toMatchObject({ value: 'Négatif', units: null, section: "Analyse d'urine" })
  })

  it('splits units out of a combined reference column, across tables', () => {
    const t = parseTruth(combinedUnits)
    expect(t.map((r) => [r.test, r.units])).toEqual([
      ['Sodium', 'mmol/L'],
      ['eGFR (CKD-EPI)', 'mL/min/1,73m²'],
      ['RBC', 'x10¹²/L'],
      ['INR', null],
      ['Potassium', 'mmol/L'],
    ])
    expect(t[1]!.reference).toBe('> 60')
  })

  it('skips the date row and previous-results columns', () => {
    const t = parseTruth(previousResults)
    expect(t).toEqual([
      { section: 'Urinalysis', test: 'Urine colour', value: 'Yellow', flag: null, units: null, reference: 'Yellow' },
      { section: 'Urinalysis', test: 'MCH', value: '35.0', flag: 'H', units: 'pg', reference: '27.0 – 33.0' },
    ])
  })

  it('parses every bundled lab report sample', () => {
    const dir = new URL('../../public/samples/', import.meta.url)
    const labs = readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as { doctype: string; page_md: string })
      .filter((d) => d.doctype === 'lab_report')
    expect(labs.length).toBeGreaterThan(0)
    for (const d of labs) {
      const t = parseTruth(d.page_md)
      expect(t.length).toBeGreaterThan(5)
      for (const r of t) expect(r.value).not.toBe('')
    }
  })
})

describe('normalization', () => {
  it('treats micro sign, superscripts and tags as equal', () => {
    expect(fold('µmol/L')).toBe(fold('μmol/L'))
    expect(fold('x10<sup>12</sup>/L')).toBe(fold('x10¹²/L'))
    expect(fold('mL/min/1,73㎡')).toBe(fold('mL/min/1,73m²'))
    expect(fold('x10^9/L')).toBe(fold('x10⁹/L'))
  })

  it('accepts a decimal comma and numeric equality', () => {
    expect(sameValue('0,11', '0.11')).toBe(true)
    expect(sameValue('35.0', '35')).toBe(true)
    expect(sameValue('Négatif', 'Negatif')).toBe(true)
    expect(sameValue('4,2', '4.3')).toBe(false)
    expect(sameValue('16', '0x10')).toBe(false)
  })

  it('reads intervals without units', () => {
    expect(unitsFromInterval('Negative')).toEqual({ units: null, reference: 'Negative' })
    expect(unitsFromInterval('< 5.0 mg/L')).toEqual({ units: 'mg/L', reference: '< 5.0' })
  })
})

describe('score', () => {
  const truth = parseTruth(separateUnits)

  it('counts values, flags and units per row', () => {
    const s = score(truth, [
      row({ test_name: 'HbA1c', value: '4,2', units: '%' }),
      row({ test_name: 'TSH', value: '0.11', flag: '*', units: 'mUI/L' }),
      row({ test_name: 'RNI', value: '0,9', flag: null }),
      row({ test_name: 'Hémoglobine', value: '140' }),
    ])
    expect(s).toMatchObject({
      rowsExpected: 4,
      rowsFound: 3,
      rowsExtracted: 4,
      valuesCorrect: 2,
      flagsCorrect: 2,
      unitsCorrect: 3,
      extraRows: ['Hémoglobine'],
    })
    expect(s.perRow[3]).toMatchObject({ test: 'Glucose', found: null, valueOk: false })
  })

  it('handles a missing or empty extraction', () => {
    expect(score(truth, null)).toMatchObject({ rowsExpected: 4, rowsFound: 0, valuesCorrect: 0 })
  })

  it('matches a name with an OCR typo', () => {
    const t = parseTruth('| Test | Result | Flag | Units | Reference range |\n|---|---|---|---|---|\n| Cholestérol total | 3,54 |  | mmol/L | < 5,20 |\n')
    const s = score(t, [row({ test_name: 'Cholestéro total', value: '3,54', units: 'mmol/L' })])
    expect(s.perRow[0]).toMatchObject({ nameOk: false, valueOk: true, unitsOk: true })
    expect(s.extraRows).toEqual([])
  })

  it('falls back to a loose name match', () => {
    const s = score(parseTruth(combinedUnits), [row({ test_name: 'eGFR', value: '51', flag: '*', units: 'mL/min/1.73m2' })])
    expect(s.perRow[1]).toMatchObject({ valueOk: true, flagOk: true })
  })

  it('does not let one test take the row of another', () => {
    const table = (...names: string[]) =>
      parseTruth(`| Test | Result |\n|---|---|\n${names.map((n) => `| ${n} | 4.2 |`).join('\n')}\n`)
    const a = score(table('RBC', 'WBC'), [row({ test_name: 'WBC', value: '4.2' })])
    expect(a.perRow.map((r) => !!r.found)).toEqual([false, true])
    const b = score(table('ALT', 'AST'), [row({ test_name: 'AST', value: '4.2' }), row({ test_name: 'A1T', value: '4.2' })])
    expect(b.perRow[1]).toMatchObject({ nameOk: true, valueOk: true })
    const c = score(table('Glucose', 'Glucose urine'), [row({ test_name: 'Glucose urine', value: '4.2' })])
    expect(c.perRow.map((r) => !!r.found)).toEqual([false, true])
  })

  it('pairs misread names by position when the gap has the same size on both sides', () => {
    const t = parseTruth('| Test | Result |\n|---|---|\n| Sodium | 1 |\n| Alkaline phosphatase | 149 |\n| Potassium | 2 |\n')
    const s = score(t, [
      row({ test_name: 'Sodium', value: '1' }),
      row({ test_name: 'Aikeline phosphonase', value: '149' }),
      row({ test_name: 'Potassium', value: '2' }),
    ])
    expect(s.valuesCorrect).toBe(3)
    expect(s.namesCorrect).toBe(2)
    expect(s.extraRows).toEqual([])
    expect(s.perRow[1]).toMatchObject({ nameOk: false, found: { index: 1 } })
  })

  it('does not pair by position when the sizes differ', () => {
    const t = parseTruth('| Test | Result |\n|---|---|\n| Sodium | 1 |\n| Zinc | 149 |\n| Copper | 3 |\n')
    const s = score(t, [row({ test_name: 'Sodium', value: '1' }), row({ test_name: 'Lead', value: '149' })])
    expect(s.rowsFound).toBe(1)
    expect(s.extraRows).toEqual(['Lead'])
  })

  it('checks the reference range', () => {
    expect(sameRange('135 – 145', 'mmol/L', '135 - 145')).toBe(true)
    expect(sameRange('135 – 145', 'mmol/L', '135 – 145 mmol/L')).toBe(true)
    expect(sameRange('0,40 – 4,00', null, '0.40-4.00')).toBe(true)
    expect(sameRange('135 – 145', 'mmol/L', '135 - 145COPIE')).toBe(false)
    expect(sameRange('22 – 29', null, '$2 - 75')).toBe(false)
    const t = parseTruth('| Test | Result | Reference range |\n|---|---|---|\n| GGT | 12 | 10 – 60 |\n')
    expect(score(t, [row({ test_name: 'GGT', value: '12', reference_text: '***' })]).referencesCorrect).toBe(0)
  })

  it('folds a decimal comma in units', () => {
    const t = parseTruth(combinedUnits)
    const s = score(t, [row({ test_name: 'eGFR (CKD-EPI)', value: '51', units: 'mL/min/1.73m²' })])
    expect(s.perRow[1]!.unitsOk).toBe(true)
  })
})

describe('fields', () => {
  const page = `**MOUNT ROYAL HOSPITAL**
8518, boulevard Pie-IX

# LABORATORY REPORT \u2014 FINAL

Patient / Patient : **CANTU, Caitlin**

Health ins. no. / No ass. maladie : **CANC 9059 0878**

Sexe / Sex : **F**

Ordering physician / Médecin requérant : **Dr Richard May (29467)**
`
  it('reads the fields the page prints', () => {
    expect(parseTruthFields(page)).toEqual({
      lab_name: 'MOUNT ROYAL HOSPITAL',
      patient_name: 'CANTU, Caitlin',
      health_insurance_number: 'CANC 9059 0878',
      sex: 'F',
      ordering_physician: 'Dr Richard May (29467)',
      report_status: 'final',
    })
  })

  it('finds a misread name, a missing field and a title used as a status', () => {
    const value = {
      lab_name: 'Mount Royal Hospital',
      patient_name: 'CANTU, CAICLIN',
      sex: 'F',
      ordering_physician: null,
      report_status: 'FINAL',
    } as never
    const out = Object.fromEntries(scoreFields(page, value).map((f) => [f.key, f.ok]))
    expect(out).toMatchObject({
      lab_name: true,
      patient_name: false,
      sex: true,
      ordering_physician: false,
      report_status: true,
    })
    expect(normStatus('LABORATORY REPORT / RAPPORT DE LABORATOIRE')).toBeNull()
    expect(normStatus('FINAL / FINAL')).toBe('final')
  })

  it('reads the fields of every bundled lab report', () => {
    const dir = new URL('../../public/samples/', import.meta.url)
    const labs = readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as { doctype: string; page_md: string })
      .filter((d) => d.doctype === 'lab_report')
    for (const d of labs) {
      const f = parseTruthFields(d.page_md)
      for (const key of ['patient_name', 'health_insurance_number', 'date_of_birth', 'sex', 'ordering_physician', 'collected_at', 'reported_at'] as const)
        expect(f[key], `${key} in a sample`).toBeTruthy()
    }
  })
})
