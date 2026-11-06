import { describe, expect, it } from 'vitest'

import { alignRows, boxesOf, cleanCitationText, rowBoxes } from './report'

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

const scored = (test: string, found: string | null, ok: Partial<RowScore> = {}): RowScore => ({
  test,
  expected: { value: '1', flag: null, units: null },
  found: found === null ? null : { test: found, value: '1', flag: null, units: null },
  nameOk: found === test,
  valueOk: true,
  flagOk: true,
  unitsOk: true,
  ...ok,
})

const score = (perRow: RowScore[]): Score => ({
  rowsExpected: perRow.length,
  rowsFound: 0,
  rowsExtracted: 0,
  valuesCorrect: 0,
  flagsCorrect: 0,
  unitsCorrect: 0,
  perRow,
  extraRows: [],
})

describe('alignRows', () => {
  it('sets each state and lists rows it cannot place', () => {
    const rows = [row('A', '1'), row('B', '1'), row('C', '1'), row('Halic', '1')]
    const { checks, missed } = alignRows(
      rows,
      score([
        scored('A', 'A'),
        scored('B', 'B', { valueOk: false }),
        scored('C', 'C', { unitsOk: false }),
        scored('HbA1c', null),
      ]),
    )
    expect(checks.map((c) => c.state)).toEqual(['ok', 'value', 'detail', 'extra'])
    expect(missed.map((m) => m.test)).toEqual(['HbA1c'])
  })

  it('does not use one extracted row twice when test names repeat', () => {
    const rows = [row('Glucose', '1'), row('Glucose', '1')]
    const { checks } = alignRows(rows, score([scored('Glucose', 'Glucose'), scored('Glucose', 'Glucose')]))
    expect(checks.map((c) => c.state)).toEqual(['ok', 'ok'])
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

  it('prefers the table whose citation names the row', () => {
    const list = [cite(0.1, 'Sodium</td><td>144'), cite(0.5, 'Ferritin</td><td>20')]
    expect(rowBoxes(list, 'ferritin')).toEqual([box(0.5)])
    expect(rowBoxes(list, 'unknown')).toEqual([box(0.1), box(0.5)])
  })

  it('removes table markup from cited text', () => {
    expect(cleanCitationText('Sodium</td><td>144<br>mmol/L')).toBe('Sodium 144 mmol/L')
  })
})
