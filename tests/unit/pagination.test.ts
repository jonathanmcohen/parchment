import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '@/lib/editor/paginate'
import {
  type BlockHeight,
  computeBreakIndices,
  contentBoxFor,
  orientationForPage,
  type PageOrientations,
  pagesFromBreaks,
  setPageOrientation,
  sheetBoxFor,
} from '@/lib/editor/pagination'

/** Helper: build BlockHeight[] from a list of plain numbers. */
const h = (...heights: number[]): BlockHeight[] => heights.map((height) => ({ height }))

describe('computeBreakIndices', () => {
  it('returns no breaks for an empty document', () => {
    expect(computeBreakIndices([], 1000)).toEqual([])
  })

  it('returns no breaks when all blocks fit on one page', () => {
    expect(computeBreakIndices(h(300, 300, 300), 1000)).toEqual([])
  })

  it('returns no breaks when blocks exactly fill one page', () => {
    expect(computeBreakIndices(h(500, 500), 1000)).toEqual([])
  })

  it('breaks before the block that overflows the first page', () => {
    // 400+400 = 800 fits; +400 = 1200 > 1000 → block 2 starts page 2.
    expect(computeBreakIndices(h(400, 400, 400), 1000)).toEqual([2])
  })

  it('breaks on every block when each pair overflows', () => {
    // 600+600 = 1200 > 1000 → a break before every block after the first.
    expect(computeBreakIndices(h(600, 600, 600, 600), 1000)).toEqual([1, 2, 3])
  })

  it('puts each exactly-full block on its own page', () => {
    expect(computeBreakIndices(h(1000, 1000), 1000)).toEqual([1])
    expect(computeBreakIndices(h(1000, 1000, 1000), 1000)).toEqual([1, 2])
  })

  it('keeps a single oversized block on one page (no infinite split)', () => {
    expect(computeBreakIndices(h(1500), 1000)).toEqual([])
  })

  it('isolates an oversized block between normal blocks', () => {
    // block0 (300) page1; block1 (1500) overflows → page2 (alone, oversized);
    // block2 (300) overflows the oversized page → page3.
    expect(computeBreakIndices(h(300, 1500, 300), 1000)).toEqual([1, 2])
  })

  it('does not break on zero-height blocks', () => {
    expect(computeBreakIndices(h(0, 0, 0, 1000), 1000)).toEqual([])
    // 1000 fills page; the trailing 1 overflows → break before it.
    expect(computeBreakIndices(h(1000, 0, 0, 1), 1000)).toEqual([3])
  })

  it('returns no breaks when usable page height is zero or negative', () => {
    expect(computeBreakIndices(h(100, 100), 0)).toEqual([])
    expect(computeBreakIndices(h(100, 100), -50)).toEqual([])
  })

  it('treats a missing height entry as zero', () => {
    const sparse = [{ height: 900 }, undefined as unknown as BlockHeight, { height: 200 }]
    // 900 + 0 + 200 = 1100 > 1000 → break before block2 (the 200).
    expect(computeBreakIndices(sparse, 1000)).toEqual([2])
  })

  it('paginates a realistic mixed document', () => {
    // Page height 920 (Letter content height ~864 in practice; use round here).
    const blocks = h(120, 120, 120, 120, 120, 120, 120, 120) // 8 × 120 = 960
    // 7 blocks = 840 ≤ 920; 8th = 960 > 920 → break before block7.
    expect(computeBreakIndices(blocks, 920)).toEqual([7])
  })
})

describe('pagesFromBreaks', () => {
  it('returns a single empty page for an empty document', () => {
    expect(pagesFromBreaks(0, [])).toEqual([{ start: 0, end: 0 }])
  })

  it('returns one page covering all blocks when there are no breaks', () => {
    expect(pagesFromBreaks(5, [])).toEqual([{ start: 0, end: 5 }])
  })

  it('splits into half-open ranges at each break', () => {
    expect(pagesFromBreaks(4, [2])).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ])
  })

  it('handles a break before every block', () => {
    expect(pagesFromBreaks(4, [1, 2, 3])).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
      { start: 3, end: 4 },
    ])
  })

  it('sanitises out-of-range and non-increasing break indices', () => {
    // 0 (not > 0), 7 (>= total), duplicate 2 — all dropped; only 2 kept.
    expect(pagesFromBreaks(4, [0, 2, 2, 7])).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ])
  })

  it('page count equals breakIndices.length + 1', () => {
    const breaks = [1, 3, 5]
    expect(pagesFromBreaks(8, breaks).length).toBe(breaks.length + 1)
  })
})

describe('page-model geometry (sheetBoxFor / contentBoxFor)', () => {
  it('Letter portrait sheet + content box', () => {
    // Letter portrait = 816×1056, 96px margins all sides → content 624×864.
    expect(sheetBoxFor(DEFAULT_PAGE_SETUP, 'portrait')).toEqual({ widthPx: 816, heightPx: 1056 })
    expect(contentBoxFor(DEFAULT_PAGE_SETUP, 'portrait')).toEqual({ widthPx: 624, heightPx: 864 })
  })

  it('Letter landscape swaps the sheet; margins applied to swapped box', () => {
    // Landscape Letter = 1056×816 → content 864×624.
    expect(sheetBoxFor(DEFAULT_PAGE_SETUP, 'landscape')).toEqual({ widthPx: 1056, heightPx: 816 })
    expect(contentBoxFor(DEFAULT_PAGE_SETUP, 'landscape')).toEqual({ widthPx: 864, heightPx: 624 })
  })

  it('a single page can resolve a different orientation than the document default', () => {
    const portraitDoc = { ...DEFAULT_PAGE_SETUP, orientation: 'portrait' as const }
    // Same setup, but ask for landscape → wider, shorter content box.
    const landscape = contentBoxFor(portraitDoc, 'landscape')
    const portrait = contentBoxFor(portraitDoc, 'portrait')
    expect(landscape.widthPx).toBeGreaterThan(portrait.widthPx)
    expect(landscape.heightPx).toBeLessThan(portrait.heightPx)
  })

  it('Custom size honours stored px and swaps on landscape', () => {
    const custom: PageSetup = {
      size: 'Custom',
      orientation: 'portrait',
      widthPx: 500,
      heightPx: 700,
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
    }
    expect(sheetBoxFor(custom, 'portrait')).toEqual({ widthPx: 500, heightPx: 700 })
    expect(sheetBoxFor(custom, 'landscape')).toEqual({ widthPx: 700, heightPx: 500 })
    expect(contentBoxFor(custom, 'portrait')).toEqual({ widthPx: 400, heightPx: 600 })
  })

  it('floors usable content dimensions at 0 for oversized margins', () => {
    const tightMargins: PageSetup = {
      ...DEFAULT_PAGE_SETUP,
      margins: { top: 2000, right: 2000, bottom: 2000, left: 2000 },
    }
    const box = contentBoxFor(tightMargins, 'portrait')
    expect(box.widthPx).toBe(0)
    expect(box.heightPx).toBe(0)
  })
})

describe('per-page orientation overrides', () => {
  const doc: PageSetup = { ...DEFAULT_PAGE_SETUP, orientation: 'portrait' }

  it('inherits the document default when no override is set', () => {
    expect(orientationForPage(doc, [], 0)).toBe('portrait')
    expect(orientationForPage(doc, [], 5)).toBe('portrait')
  })

  it('uses an explicit override when present', () => {
    const orientations: PageOrientations = [undefined, 'landscape', undefined]
    expect(orientationForPage(doc, orientations, 0)).toBe('portrait')
    expect(orientationForPage(doc, orientations, 1)).toBe('landscape')
    expect(orientationForPage(doc, orientations, 2)).toBe('portrait')
  })

  it('out-of-range page index inherits the default', () => {
    const orientations: PageOrientations = ['landscape']
    expect(orientationForPage(doc, orientations, 9)).toBe('portrait')
    expect(orientationForPage(doc, orientations, -1)).toBe('portrait')
  })

  it('setPageOrientation stores a non-default override and grows the list', () => {
    const next = setPageOrientation(doc, [], 2, 'landscape')
    expect(next).toEqual([undefined, undefined, 'landscape'])
    expect(orientationForPage(doc, next, 2)).toBe('landscape')
  })

  it('setPageOrientation collapses a default-equal value back to inherit', () => {
    const withOverride = setPageOrientation(doc, [], 1, 'landscape')
    // Setting it back to the document default (portrait) stores undefined.
    const reverted = setPageOrientation(doc, withOverride, 1, 'portrait')
    expect(reverted[1]).toBeUndefined()
    expect(orientationForPage(doc, reverted, 1)).toBe('portrait')
  })

  it('setPageOrientation is immutable (does not mutate the input list)', () => {
    const original: Array<'portrait' | 'landscape' | undefined> = [undefined]
    const next = setPageOrientation(doc, original, 0, 'landscape')
    expect(original).toEqual([undefined])
    expect(next).not.toBe(original)
  })

  it('landscape page content width drives a different paginator usable height', () => {
    // Demonstrates the engine + model composing: a landscape page has a shorter
    // usable height, so the same blocks break sooner.
    const blocks = h(300, 300, 300, 300) // 1200 total
    const portraitH = contentBoxFor(doc, 'portrait').heightPx // 864
    const landscapeH = contentBoxFor(doc, 'landscape').heightPx // 624
    // portrait: 864 → 300×2=600 fits, +300=900>864 → break at 2.
    expect(computeBreakIndices(blocks, portraitH)).toEqual([2])
    // landscape: 624 → 300 fits, +300=600 fits, +300=900>624 → break at 2 as well
    // (600 ≤ 624). Use a taller case to show the shorter box breaks sooner:
    expect(computeBreakIndices(h(400, 400), landscapeH)).toEqual([1]) // 800>624
    expect(computeBreakIndices(h(400, 400), portraitH)).toEqual([]) // 800≤864
  })
})
