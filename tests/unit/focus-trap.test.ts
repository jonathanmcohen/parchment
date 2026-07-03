import { describe, expect, it } from 'vitest'
import { nextTrapIndex } from '@/lib/a11y/focus-trap'

// v0.2.10 mobile pass — the off-canvas drawer and the toolbar `⋯` bottom sheet are
// modal overlays: Tab / Shift+Tab must CYCLE within the overlay's focusables (never
// escape to the page behind the scrim). `nextTrapIndex` is the pure wrap-around math
// the modal-overlay hook uses to compute the destination index for a trapped Tab.

describe('nextTrapIndex', () => {
  it('advances forward within the list', () => {
    expect(nextTrapIndex(0, 4, 'forward')).toBe(1)
    expect(nextTrapIndex(2, 4, 'forward')).toBe(3)
  })

  it('wraps from the last element to the first on forward Tab', () => {
    expect(nextTrapIndex(3, 4, 'forward')).toBe(0)
  })

  it('moves backward within the list', () => {
    expect(nextTrapIndex(3, 4, 'backward')).toBe(2)
    expect(nextTrapIndex(1, 4, 'backward')).toBe(0)
  })

  it('wraps from the first element to the last on Shift+Tab', () => {
    expect(nextTrapIndex(0, 4, 'backward')).toBe(3)
  })

  it('treats a not-currently-in-list index (-1) as entering at the edge', () => {
    // Focus outside the trap → forward enters at 0, backward enters at the last.
    expect(nextTrapIndex(-1, 4, 'forward')).toBe(0)
    expect(nextTrapIndex(-1, 4, 'backward')).toBe(3)
  })

  it('returns -1 when there are no focusable elements', () => {
    expect(nextTrapIndex(0, 0, 'forward')).toBe(-1)
    expect(nextTrapIndex(-1, 0, 'backward')).toBe(-1)
  })

  it('stays put when there is a single focusable element', () => {
    expect(nextTrapIndex(0, 1, 'forward')).toBe(0)
    expect(nextTrapIndex(0, 1, 'backward')).toBe(0)
  })
})
