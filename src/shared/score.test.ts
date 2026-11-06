import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { fold, parseTruth, sameValue, score, unitsFromInterval } from './score'

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
})
