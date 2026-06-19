import { describe, expect, it } from 'vitest'
import { measurePageBreaks, pageCount, pageDims } from '@/lib/editor/paginate'

describe('pageDims', () => {
  it('Letter portrait', () => {
    expect(pageDims('Letter')).toEqual({ widthPx: 816, heightPx: 1056 })
  })

  it('A4 portrait', () => {
    expect(pageDims('A4')).toEqual({ widthPx: 794, heightPx: 1123 })
  })

  it('Legal portrait', () => {
    expect(pageDims('Legal')).toEqual({ widthPx: 816, heightPx: 1344 })
  })

  it('Tabloid portrait', () => {
    expect(pageDims('Tabloid')).toEqual({ widthPx: 1056, heightPx: 1632 })
  })

  it('Letter landscape swaps width/height', () => {
    expect(pageDims('Letter', 'landscape')).toEqual({ widthPx: 1056, heightPx: 816 })
  })

  it('A4 landscape', () => {
    expect(pageDims('A4', 'landscape')).toEqual({ widthPx: 1123, heightPx: 794 })
  })
})

describe('measurePageBreaks', () => {
  it('single break when content spans one-and-a-bit pages', () => {
    expect(measurePageBreaks(2000, 1056)).toEqual([1056])
  })

  it('three breaks when content overflows three pages into a fourth', () => {
    expect(measurePageBreaks(3200, 1056)).toEqual([1056, 2112, 3168])
  })

  it('no breaks when content fits within one page', () => {
    expect(measurePageBreaks(1000, 1056)).toEqual([])
  })

  it('no breaks when content exactly equals one page', () => {
    expect(measurePageBreaks(1056, 1056)).toEqual([])
  })
})

describe('pageCount', () => {
  it('returns 1 when content fits in one page', () => {
    expect(pageCount(1000, 1056)).toBe(1)
  })

  it('returns 2 when content spans two pages', () => {
    expect(pageCount(2000, 1056)).toBe(2)
  })

  it('returns 4 when content overflows three pages into a fourth', () => {
    expect(pageCount(3200, 1056)).toBe(4)
  })

  it('returns 1 for zero height content', () => {
    expect(pageCount(0, 1056)).toBe(1)
  })

  it('returns 1 when content exactly fills one page', () => {
    expect(pageCount(1056, 1056)).toBe(1)
  })
})
