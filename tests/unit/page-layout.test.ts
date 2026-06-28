import { Schema } from '@tiptap/pm/model'
import { describe, expect, it } from 'vitest'
import {
  computePageLayout,
  type PageGeometry,
  topLevelBlockOffsets,
} from '@/lib/editor/pagination/page-layout'

// Geometry mirroring US-Letter @96dpi with 1in margins:
// pageHeight 1056, margins 96, usableHeight 1056-96-96 = 864.
const GEO: PageGeometry = {
  usableHeight: 864,
  topMargin: 96,
  bottomMargin: 96,
  gutter: 24,
  pageHeight: 1056,
}

describe('computePageLayout', () => {
  it('empty doc → single full-height page, no breaks/spacers', () => {
    const layout = computePageLayout([], new Set(), GEO)
    expect(layout.breakBeforeBlock).toEqual([])
    expect(layout.spacers).toEqual([])
    expect(layout.pageBoxes).toEqual([{ top: 0, height: 1056, oversized: false }])
  })

  it('content that fits one page → one page, no breaks', () => {
    const layout = computePageLayout([200, 200, 200], new Set(), GEO)
    expect(layout.breakBeforeBlock).toEqual([])
    expect(layout.spacers).toEqual([])
    expect(layout.pageBoxes).toHaveLength(1)
  })

  it('overflow forces a break before the overflowing block', () => {
    // 500 + 500 = 1000 > 864 → break before block 1.
    const layout = computePageLayout([500, 500], new Set(), GEO)
    expect(layout.breakBeforeBlock).toEqual([1])
    expect(layout.spacers).toHaveLength(1)
    expect(layout.spacers[0]?.beforeBlockIndex).toBe(1)
    // spacer = (usable - usedPage0) + bottom + gutter + top
    //        = (864 - 500) + 96 + 24 + 96 = 580
    expect(layout.spacers[0]?.height).toBe(580)
  })

  it('bottom-margin guarantee: every spacer ≥ bottom + gutter + top', () => {
    const layout = computePageLayout([400, 400, 400, 400], new Set(), GEO)
    for (const s of layout.spacers) {
      expect(s.height).toBeGreaterThanOrEqual(GEO.bottomMargin + GEO.gutter + GEO.topMargin)
    }
  })

  it('page boxes are cumulative: top[k+1] = top[k] + height[k] + gutter', () => {
    const layout = computePageLayout([500, 500, 500], new Set(), GEO)
    // 3 blocks of 500: page0=[0] (500), break@1, page1=[1] (500), break@2, page2=[2]
    expect(layout.pageBoxes).toHaveLength(3)
    expect(layout.pageBoxes[0]).toEqual({ top: 0, height: 1056, oversized: false })
    expect(layout.pageBoxes[1]).toEqual({ top: 1056 + 24, height: 1056, oversized: false })
    expect(layout.pageBoxes[2]).toEqual({ top: 2 * (1056 + 24), height: 1056, oversized: false })
  })

  it('a block taller than a page gets its own grown sheet, no break before it if alone', () => {
    const layout = computePageLayout([2000], new Set(), GEO)
    expect(layout.breakBeforeBlock).toEqual([])
    expect(layout.pageBoxes).toHaveLength(1)
    expect(layout.pageBoxes[0]?.oversized).toBe(true)
    // grown height = content + top + bottom = 2000 + 96 + 96
    expect(layout.pageBoxes[0]?.height).toBe(2192)
  })

  it('oversized block in the middle is isolated on its own page', () => {
    // [300, 2000, 300]: 300 fits page0; +2000 overflows → break@1; 2000 alone
    // (oversized); +300 overflows (used already > usable) → break@2.
    const layout = computePageLayout([300, 2000, 300], new Set(), GEO)
    expect(layout.breakBeforeBlock).toEqual([1, 2])
    expect(layout.pageBoxes).toHaveLength(3)
    expect(layout.pageBoxes[1]?.oversized).toBe(true)
    expect(layout.pageBoxes[1]?.height).toBe(2000 + 96 + 96)
  })

  it('forced break splits even when content would fit', () => {
    const layout = computePageLayout([100, 100], new Set([1]), GEO)
    expect(layout.breakBeforeBlock).toEqual([1])
    // usedPage0 = 100 → spacer = (864-100)+96+24+96 = 980
    expect(layout.spacers[0]?.height).toBe(980)
  })

  it('degenerate usableHeight ≤ 0 → one page, no breaks', () => {
    const layout = computePageLayout([100, 100], new Set(), { ...GEO, usableHeight: 0 })
    expect(layout.breakBeforeBlock).toEqual([])
    expect(layout.pageBoxes).toHaveLength(1)
  })
})

describe('topLevelBlockOffsets', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'text*' },
      text: {},
    },
  })

  it('returns the PM position before each top-level block', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('ab')]), // nodeSize = 2 + 2 = 4
      schema.node('paragraph', null, [schema.text('cde')]), // nodeSize = 3 + 2 = 5
      schema.node('paragraph'), // empty, nodeSize = 2
    ])
    expect(topLevelBlockOffsets(doc)).toEqual([0, 4, 9])
  })

  it('empty doc → no offsets', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph')])
    expect(topLevelBlockOffsets(doc)).toEqual([0])
  })
})
