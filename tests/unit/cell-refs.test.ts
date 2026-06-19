import { describe, expect, it } from 'vitest'
import { cellRef, colLabel } from '@/lib/editor/cell-refs'

describe('colLabel', () => {
  it('0 → A', () => {
    expect(colLabel(0)).toBe('A')
  })

  it('25 → Z', () => {
    expect(colLabel(25)).toBe('Z')
  })

  it('26 → AA', () => {
    expect(colLabel(26)).toBe('AA')
  })

  it('27 → AB', () => {
    expect(colLabel(27)).toBe('AB')
  })

  it('51 → AZ', () => {
    expect(colLabel(51)).toBe('AZ')
  })

  it('52 → BA', () => {
    expect(colLabel(52)).toBe('BA')
  })
})

describe('cellRef', () => {
  it('(0, 0) → A1', () => {
    expect(cellRef(0, 0)).toBe('A1')
  })

  it('(2, 1) → B3', () => {
    expect(cellRef(2, 1)).toBe('B3')
  })

  it('(0, 25) → Z1', () => {
    expect(cellRef(0, 25)).toBe('Z1')
  })

  it('(0, 26) → AA1', () => {
    expect(cellRef(0, 26)).toBe('AA1')
  })
})
