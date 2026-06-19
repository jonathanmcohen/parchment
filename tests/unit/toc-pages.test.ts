import { describe, expect, it } from 'vitest'
import { headingPage } from '@/lib/editor/toc-pages'

// Pure function — no jsdom required.

describe('headingPage', () => {
  it('returns 1 for offset 0 (top of document)', () => {
    expect(headingPage(0, 1056)).toBe(1)
  })

  it('returns 2 for offset 1100 (past the first page break at 1056)', () => {
    expect(headingPage(1100, 1056)).toBe(2)
  })

  it('returns 3 for offset 2200 (into the third page)', () => {
    expect(headingPage(2200, 1056)).toBe(3)
  })

  it('returns 1 for offset exactly at page height minus 1', () => {
    expect(headingPage(1055, 1056)).toBe(1)
  })

  it('returns 2 for offset exactly at page height (boundary goes to next page)', () => {
    expect(headingPage(1056, 1056)).toBe(2)
  })

  it('works with different page heights (A4 = 1123px)', () => {
    expect(headingPage(0, 1123)).toBe(1)
    expect(headingPage(1200, 1123)).toBe(2)
  })
})
