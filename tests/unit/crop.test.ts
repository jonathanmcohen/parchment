import { describe, expect, it } from 'vitest'
import {
  clampRect,
  displayRectToSource,
  extForFormat,
  initialCropRect,
  pickDefaultFormat,
  resizeCropRect,
} from '@/lib/editor/crop'

describe('initialCropRect', () => {
  it('centers a default 80% crop', () => {
    expect(initialCropRect({ width: 100, height: 100 })).toEqual({
      x: 10,
      y: 10,
      width: 80,
      height: 80,
    })
  })

  it('honors an explicit fraction', () => {
    expect(initialCropRect({ width: 200, height: 100 }, 0.5)).toEqual({
      x: 50,
      y: 25,
      width: 100,
      height: 50,
    })
  })
})

describe('clampRect', () => {
  it('keeps a rect inside bounds', () => {
    const r = clampRect({ x: -10, y: -10, width: 50, height: 50 }, { width: 100, height: 100 })
    expect(r).toEqual({ x: 0, y: 0, width: 50, height: 50 })
  })

  it('pushes an oversized rect back inside and caps its size', () => {
    const r = clampRect({ x: 80, y: 80, width: 200, height: 200 }, { width: 100, height: 100 })
    expect(r).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('enforces a minimum size', () => {
    const r = clampRect({ x: 10, y: 10, width: 2, height: 2 }, { width: 100, height: 100 }, 16)
    expect(r.width).toBe(16)
    expect(r.height).toBe(16)
  })
})

describe('resizeCropRect', () => {
  const bounds = { width: 100, height: 100 }

  it('grows from the SE corner toward bottom-right', () => {
    const r = resizeCropRect({ x: 10, y: 10, width: 20, height: 20 }, 'se', 10, 10, bounds)
    expect(r).toEqual({ x: 10, y: 10, width: 30, height: 30 })
  })

  it('grows from the NW corner toward top-left (anchors SE)', () => {
    const r = resizeCropRect({ x: 30, y: 30, width: 20, height: 20 }, 'nw', -10, -10, bounds)
    expect(r).toEqual({ x: 20, y: 20, width: 30, height: 30 })
  })

  it('floors at the minimum size when dragged past the anchor', () => {
    const r = resizeCropRect({ x: 10, y: 10, width: 20, height: 20 }, 'se', -100, -100, bounds, 16)
    expect(r.width).toBe(16)
    expect(r.height).toBe(16)
  })

  it('clamps the moving edge to the image bounds', () => {
    const r = resizeCropRect({ x: 10, y: 10, width: 20, height: 20 }, 'se', 1000, 1000, bounds)
    expect(r).toEqual({ x: 10, y: 10, width: 90, height: 90 })
  })
})

describe('displayRectToSource', () => {
  it('is identity at 1:1 scale', () => {
    const s = displayRectToSource(
      { x: 10, y: 20, width: 30, height: 40 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    )
    expect(s).toEqual({ sx: 10, sy: 20, sw: 30, sh: 40 })
  })

  it('scales up to natural resolution', () => {
    const s = displayRectToSource(
      { x: 10, y: 10, width: 40, height: 40 },
      { width: 100, height: 100 },
      { width: 200, height: 200 },
    )
    expect(s).toEqual({ sx: 20, sy: 20, sw: 80, sh: 80 })
  })

  it('rounds non-integer ratios', () => {
    const s = displayRectToSource(
      { x: 0, y: 0, width: 33, height: 33 },
      { width: 100, height: 100 },
      { width: 150, height: 150 },
    )
    expect(s).toEqual({ sx: 0, sy: 0, sw: 50, sh: 50 })
  })

  it('clamps a crop flush to the right/bottom edge', () => {
    const s = displayRectToSource(
      { x: 90, y: 90, width: 20, height: 20 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    )
    expect(s.sx + s.sw).toBeLessThanOrEqual(100)
    expect(s.sy + s.sh).toBeLessThanOrEqual(100)
  })
})

describe('pickDefaultFormat', () => {
  it('preserves jpeg/webp/png from mime', () => {
    expect(pickDefaultFormat('image/jpeg', 'x')).toBe('image/jpeg')
    expect(pickDefaultFormat('image/webp', 'x')).toBe('image/webp')
    expect(pickDefaultFormat('image/png', 'x')).toBe('image/png')
  })

  it('falls back to png for gif/svg/unknown mime', () => {
    expect(pickDefaultFormat('image/gif', 'x')).toBe('image/png')
    expect(pickDefaultFormat('image/svg+xml', 'x')).toBe('image/png')
    expect(pickDefaultFormat('application/octet-stream', 'x')).toBe('image/png')
  })

  it('derives from the src extension when mime is absent', () => {
    expect(pickDefaultFormat(undefined, '/a/b.png')).toBe('image/png')
    expect(pickDefaultFormat(undefined, 'https://x/y.jpeg?v=2')).toBe('image/jpeg')
    expect(pickDefaultFormat(undefined, 'blob:nope')).toBe('image/png')
  })
})

describe('extForFormat', () => {
  it('maps mime to file extension', () => {
    expect(extForFormat('image/png')).toBe('png')
    expect(extForFormat('image/jpeg')).toBe('jpg')
    expect(extForFormat('image/webp')).toBe('webp')
  })
})
