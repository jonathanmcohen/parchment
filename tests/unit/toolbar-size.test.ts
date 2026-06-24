import { describe, expect, it } from 'vitest'
import {
  clampFontSize,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  stepFontSize,
} from '@/lib/editor/toolbar-size'

// F3: the size −/+ chips and the numeric input share ONE clamp. A step must
// never escape the inclusive [1, 999] range; the unit is preserved by the
// caller (this helper governs only the numeric magnitude).

describe('clampFontSize', () => {
  it('passes through values inside the range', () => {
    expect(clampFontSize(12)).toBe(12)
    expect(clampFontSize(1)).toBe(MIN_FONT_SIZE)
    expect(clampFontSize(999)).toBe(MAX_FONT_SIZE)
  })

  it('clamps below the minimum up to 1', () => {
    expect(clampFontSize(0)).toBe(1)
    expect(clampFontSize(-5)).toBe(1)
  })

  it('clamps above the maximum down to 999', () => {
    expect(clampFontSize(1000)).toBe(999)
    expect(clampFontSize(99_999)).toBe(999)
  })

  it('truncates fractional values', () => {
    expect(clampFontSize(12.9)).toBe(12)
  })

  it('folds NaN to the minimum', () => {
    expect(clampFontSize(Number.NaN)).toBe(1)
  })
})

describe('stepFontSize', () => {
  it('increments and decrements by the delta', () => {
    expect(stepFontSize(12, 1)).toBe(13)
    expect(stepFontSize(12, -1)).toBe(11)
  })

  it('preserves the lower bound when decrementing at the floor', () => {
    expect(stepFontSize(1, -1)).toBe(1)
  })

  it('preserves the upper bound when incrementing at the ceiling', () => {
    expect(stepFontSize(999, 1)).toBe(999)
  })
})
