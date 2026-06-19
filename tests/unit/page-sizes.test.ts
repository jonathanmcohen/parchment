import { describe, expect, it } from 'vitest'
import {
  cmToPx,
  DEFAULT_PAGE_SETUP,
  inToPx,
  pxToCm,
  pxToIn,
  resolvePageDims,
} from '@/lib/editor/paginate'

describe('unit conversion helpers', () => {
  it('inToPx(1) === 96', () => {
    expect(inToPx(1)).toBe(96)
  })

  it('pxToIn(96) === 1', () => {
    expect(pxToIn(96)).toBe(1)
  })

  it('cmToPx(2.54) ≈ 96', () => {
    expect(cmToPx(2.54)).toBeCloseTo(96)
  })

  it('pxToCm(96) ≈ 2.54', () => {
    expect(pxToCm(96)).toBeCloseTo(2.54)
  })
})

describe('resolvePageDims', () => {
  it('A4 portrait returns correct dims', () => {
    expect(
      resolvePageDims({ size: 'A4', orientation: 'portrait', widthPx: 0, heightPx: 0 }),
    ).toEqual({ widthPx: 794, heightPx: 1123 })
  })

  it('Letter landscape swaps width/height', () => {
    expect(
      resolvePageDims({ size: 'Letter', orientation: 'landscape', widthPx: 0, heightPx: 0 }),
    ).toEqual({ widthPx: 1056, heightPx: 816 })
  })

  it('Custom portrait returns provided dims unchanged', () => {
    expect(
      resolvePageDims({ size: 'Custom', orientation: 'portrait', widthPx: 500, heightPx: 700 }),
    ).toEqual({ widthPx: 500, heightPx: 700 })
  })

  it('Custom landscape swaps provided dims', () => {
    expect(
      resolvePageDims({ size: 'Custom', orientation: 'landscape', widthPx: 500, heightPx: 700 }),
    ).toEqual({ widthPx: 700, heightPx: 500 })
  })
})

describe('DEFAULT_PAGE_SETUP', () => {
  it('is Letter portrait with 1in margins', () => {
    expect(DEFAULT_PAGE_SETUP.size).toBe('Letter')
    expect(DEFAULT_PAGE_SETUP.orientation).toBe('portrait')
    expect(DEFAULT_PAGE_SETUP.margins.top).toBe(96)
    expect(DEFAULT_PAGE_SETUP.margins.right).toBe(96)
    expect(DEFAULT_PAGE_SETUP.margins.bottom).toBe(96)
    expect(DEFAULT_PAGE_SETUP.margins.left).toBe(96)
  })
})
