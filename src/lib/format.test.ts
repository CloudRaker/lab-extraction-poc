import { describe, expect, it } from 'vitest'

import { flagInfo, statusLabel } from './format'

describe('flagInfo', () => {
  it('separates critical values from mild ones', () => {
    expect(flagInfo('**', true)).toEqual({ label: 'Critical', tone: 'danger' })
    expect(flagInfo('HH', true)).toEqual({ label: 'Critical', tone: 'danger' })
    expect(flagInfo('*', true)).toEqual({ label: 'Out of range', tone: 'warning' })
    expect(flagInfo('h', true)).toEqual({ label: 'High', tone: 'warning' })
  })

  it('does not call a speck on the page abnormal', () => {
    expect(flagInfo('..', true)).toEqual({ label: 'Unclear mark', tone: 'neutral' })
  })

  it('shows nothing for a normal row', () => {
    expect(flagInfo(null, false)).toBeNull()
  })
})

describe('statusLabel', () => {
  it('hides a title that is not a status', () => {
    expect(statusLabel('FINAL / FINAL')).toBe('Final')
    expect(statusLabel('LABORATORY REPORT / RAPPORT DE LABORATOIRE')).toBeNull()
  })
})
