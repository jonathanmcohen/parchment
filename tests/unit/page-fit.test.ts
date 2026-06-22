import { describe, expect, it } from 'vitest'
import { classifySwipe, isMobileWidth, pageFitScale } from '@/lib/editor/page-fit'

describe('pageFitScale', () => {
  it('returns 1 when available width equals page width', () => {
    expect(pageFitScale(816, 816)).toBe(1)
  })

  it('returns 1 when available width exceeds page width (desktop)', () => {
    expect(pageFitScale(1200, 816)).toBe(1)
  })

  it('returns a fraction less than 1 for narrow viewports', () => {
    const scale = pageFitScale(375, 816)
    expect(scale).toBeGreaterThan(0)
    expect(scale).toBeLessThan(1)
  })

  it('respects gutter by subtracting 2×gutter from available width', () => {
    // With gutter=0: scale = 375/816
    // With gutter=20: scale = (375 - 40)/816 = 335/816
    const withoutGutter = pageFitScale(375, 816, 0)
    const withGutter = pageFitScale(375, 816, 20)
    expect(withGutter).toBeLessThan(withoutGutter)
  })

  it('clamps to SCALE_FLOOR for very narrow viewports', () => {
    // 50px available / 816px page → raw ~0.06, below floor of 0.2
    const scale = pageFitScale(50, 816)
    expect(scale).toBeGreaterThanOrEqual(0.2)
  })

  it('returns 1 for non-finite pageWidthPx (divide-by-zero guard)', () => {
    expect(pageFitScale(375, 0)).toBe(1)
    expect(pageFitScale(375, Number.NaN)).toBe(1)
    expect(pageFitScale(375, Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('returns 1 for non-finite or zero availableWidthPx', () => {
    expect(pageFitScale(0, 816)).toBe(1)
    expect(pageFitScale(Number.NaN, 816)).toBe(1)
    expect(pageFitScale(-100, 816)).toBe(1)
  })
})

describe('isMobileWidth', () => {
  it('returns true at exactly the breakpoint', () => {
    expect(isMobileWidth(768)).toBe(true)
  })

  it('returns true below the breakpoint', () => {
    expect(isMobileWidth(375)).toBe(true)
  })

  it('returns false above the breakpoint', () => {
    expect(isMobileWidth(769)).toBe(false)
  })

  it('respects a custom breakpoint', () => {
    expect(isMobileWidth(600, 600)).toBe(true)
    expect(isMobileWidth(601, 600)).toBe(false)
  })
})

describe('classifySwipe', () => {
  it('left swipe beyond threshold → next', () => {
    expect(classifySwipe(-80, 10)).toBe('next')
  })

  it('right swipe beyond threshold → prev', () => {
    expect(classifySwipe(80, 10)).toBe('prev')
  })

  it('predominantly vertical swipe → none', () => {
    expect(classifySwipe(80, 100)).toBe('none')
  })

  it('below threshold → none', () => {
    expect(classifySwipe(30, 5)).toBe('none')
  })

  it('equal |dx| and |dy| → none (not horizontal-dominant)', () => {
    expect(classifySwipe(80, 80)).toBe('none')
  })

  it('respects custom threshold', () => {
    expect(classifySwipe(50, 5, 100)).toBe('none')
    // dx=110 is a right swipe → prev page; dx=-110 is a left swipe → next page
    expect(classifySwipe(-110, 5, 100)).toBe('next')
    expect(classifySwipe(110, 5, 100)).toBe('prev')
  })
})
