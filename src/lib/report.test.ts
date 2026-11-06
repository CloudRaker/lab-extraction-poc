import { describe, expect, it } from 'vitest'

import { alignRows, boxesOf, cleanCitationText, rowCitations } from './report'

import type { Citation, LabResultRow, RowScore, Score } from '@/shared/contract'

const row = (test_name: string, value: string): LabResultRow => ({
  section: null,
  test_name,
  value,
  numeric_value: null,
  flag: null,
  units: null,
  reference_low: null,
  reference_high: null,
  reference_text: null,
  abnormal: false,
})

const scored = (test: string, index: number | null, ok: Partial<RowScore> = {}): RowScore => ({
  test,
  expected: { value: '1', flag: null, units: null, reference: null },
  found: index === null ? null : { index, test, value: '1', flag: null, units: null, reference: null },
  nameOk: true,
  valueOk: true,
  flagOk: true,
  unitsOk: true,
  referenceOk: true,
  ...ok,
})

const score = (perRow: RowScore[]): Score => ({
  rowsExpected: perRow.length,
  rowsFound: 0,
  rowsExtracted: 0,
  namesCorrect: 0,
  valuesCorrect: 0,
  flagsCorrect: 0,
  unitsCorrect: 0,
  referencesCorrect: 0,
  perRow,
  extraRows: [],
  fields: [],
})

describe('alignRows', () => {
  it('sets each state and lists rows it cannot place', () => {
    const rows = [row('A', '1'), row('B', '1'), row('C', '1'), row('Halic', '1')]
    const { checks, missed } = alignRows(
      rows,
      score([
        scored('A', 0),
        scored('B', 1, { valueOk: false }),
        scored('C', 2, { unitsOk: false }),
        scored('HbA1c', null),
      ]),
    )
    expect(checks.map((c) => c.state)).toEqual(['ok', 'value', 'detail', 'extra'])
    expect(missed.map((m) => m.test)).toEqual(['HbA1c'])
  })

  it('does not call a row correct when the name or the range differs', () => {
    const { checks } = alignRows(
      [row('Vitamin D12', '1'), row('Sodium', '1')],
      score([scored('Vitamin B12', 0, { nameOk: false }), scored('Sodium', 1, { referenceOk: false })]),
    )
    expect(checks.map((c) => c.state)).toEqual(['detail', 'detail'])
  })

  it('marks rows unscored without a ground truth', () => {
    expect(alignRows([row('A', '1')], null).checks[0]?.state).toBe('unscored')
  })
})

describe('citations', () => {
  const box = (y: number) => ({ x: 0.1, y, width: 0.8, height: 0.1 })
  const cite = (y: number, text: string): Citation => ({ fileId: 'f', page: 0, bbox: box(y), text })

  it('drops duplicate boxes, missing boxes and other pages', () => {
    const list: Citation[] = [cite(0.1, 'a'), cite(0.1, 'b'), { fileId: 'f' }, { ...cite(0.5, 'c'), page: 1 }]
    expect(boxesOf(list)).toEqual([box(0.1)])
  })

  it('gives a row the box of its table, and the rows after it the same box', () => {
    const list = [cite(0.1, 'Sodium</td><td>144'), cite(0.5, 'Ferritin</td><td>20')]
    const out = rowCitations(list, [row('Sodium', '1'), row('Potassium', '1'), row('Ferritin', '1'), row('Zinc', '1')])
    expect(out.map((r) => r.basis)).toEqual(['named', 'nearby', 'named', 'nearby'])
    expect(out.map((r) => r.boxes)).toEqual([[box(0.1)], [box(0.1)], [box(0.5)], [box(0.5)]])
  })

  it('claims less when no citation text names a row, and drops heading boxes', () => {
    const heading = { fileId: 'f', page: 0, bbox: { x: 0, y: 0.4, width: 0.2, height: 0.01 }, text: 'Panel' }
    const out = rowCitations([cite(0.1, 'Analytes'), heading], [row('Potassium', '1')])
    expect(out[0]).toEqual({ boxes: [box(0.1)], basis: 'general' })
  })

  it('gives no box to a row above the first named row', () => {
    const out = rowCitations([cite(0.5, 'Sodium')], [row('TSH', '1'), row('Sodium', '1')])
    expect(out.map((r) => r.basis)).toEqual(['none', 'named'])
    expect(out[0]?.boxes).toEqual([])
  })

  it('finds a name right after table markup', () => {
    const out = rowCitations([cite(0.1, '<tr><th>2023-01-29</th></tr><tr><td>HbA1c</td><td>5,7</td></tr>')], [row('HbA1c', '1')])
    expect(out[0]?.basis).toBe('named')
  })

  it('does not match a name inside another word', () => {
    const out = rowCitations([cite(0.1, 'Gastric acid')], [row('AST', '1')])
    expect(out[0]?.basis).toBe('general')
  })

  it('removes table markup from cited text', () => {
    expect(cleanCitationText('Sodium</td><td>144<br>mmol/L')).toBe('Sodium 144 mmol/L')
  })
})
