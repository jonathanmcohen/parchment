import { describe, expect, it } from 'vitest'
import { DEFAULT_WATERMARK, parseWatermark, watermarkLayerStyle } from '@/lib/editor/watermark'

describe('DEFAULT_WATERMARK', () => {
  it('is disabled by default', () => {
    expect(DEFAULT_WATERMARK.enabled).toBe(false)
  })

  it('has expected default field values', () => {
    expect(DEFAULT_WATERMARK.kind).toBe('text')
    expect(DEFAULT_WATERMARK.text).toBe('DRAFT')
    expect(DEFAULT_WATERMARK.opacity).toBe(0.12)
    expect(DEFAULT_WATERMARK.rotation).toBe(-45)
    expect(DEFAULT_WATERMARK.tile).toBe(false)
    expect(DEFAULT_WATERMARK.color).toBe('#888888')
    expect(DEFAULT_WATERMARK.fontSize).toBe(72)
    expect(DEFAULT_WATERMARK.imageUrl).toBe('')
  })
})

describe('parseWatermark', () => {
  it('returns defaults for undefined', () => {
    const result = parseWatermark(undefined)
    expect(result).toEqual(DEFAULT_WATERMARK)
  })

  it('returns defaults for null', () => {
    const result = parseWatermark(null)
    expect(result).toEqual(DEFAULT_WATERMARK)
  })

  it('returns defaults for a non-object (string)', () => {
    const result = parseWatermark('DRAFT')
    expect(result).toEqual(DEFAULT_WATERMARK)
  })

  it('returns defaults for an array', () => {
    const result = parseWatermark([1, 2, 3])
    expect(result).toEqual(DEFAULT_WATERMARK)
  })

  it('clamps opacity > 1 to 1', () => {
    const result = parseWatermark({ opacity: 5 })
    expect(result.opacity).toBe(1)
  })

  it('clamps opacity < 0 to 0', () => {
    const result = parseWatermark({ opacity: -0.5 })
    expect(result.opacity).toBe(0)
  })

  it('falls back to default kind for unknown kind', () => {
    const result = parseWatermark({ kind: 'video' })
    expect(result.kind).toBe('text')
  })

  it('falls back to default kind for non-string kind', () => {
    const result = parseWatermark({ kind: 42 })
    expect(result.kind).toBe('text')
  })

  it('falls back to default rotation for non-number rotation', () => {
    const result = parseWatermark({ rotation: 'steep' })
    expect(result.rotation).toBe(DEFAULT_WATERMARK.rotation)
  })

  it('preserves valid fields as-is', () => {
    const input = {
      enabled: true,
      kind: 'image',
      text: 'CONFIDENTIAL',
      imageUrl: '/api/assets/logo.png',
      opacity: 0.3,
      rotation: 30,
      tile: true,
      color: '#ff0000',
      fontSize: 100,
    }
    const result = parseWatermark(input)
    expect(result.enabled).toBe(true)
    expect(result.kind).toBe('image')
    expect(result.text).toBe('CONFIDENTIAL')
    expect(result.imageUrl).toBe('/api/assets/logo.png')
    expect(result.opacity).toBe(0.3)
    expect(result.rotation).toBe(30)
    expect(result.tile).toBe(true)
    expect(result.color).toBe('#ff0000')
    expect(result.fontSize).toBe(100)
  })

  it('clamps rotation > 180 to 180', () => {
    const result = parseWatermark({ rotation: 270 })
    expect(result.rotation).toBe(180)
  })

  it('clamps rotation < -180 to -180', () => {
    const result = parseWatermark({ rotation: -999 })
    expect(result.rotation).toBe(-180)
  })

  it('clamps fontSize < 8 to 8', () => {
    const result = parseWatermark({ fontSize: 2 })
    expect(result.fontSize).toBe(8)
  })

  it('clamps fontSize > 300 to 300', () => {
    const result = parseWatermark({ fontSize: 9999 })
    expect(result.fontSize).toBe(300)
  })

  it('handles a deeply malformed object without throwing', () => {
    const malformed = { enabled: null, kind: {}, opacity: 'lots', rotation: [], fontSize: NaN }
    expect(() => parseWatermark(malformed)).not.toThrow()
    const result = parseWatermark(malformed)
    expect(result.opacity).toBe(DEFAULT_WATERMARK.opacity)
    expect(result.rotation).toBe(DEFAULT_WATERMARK.rotation)
    expect(result.fontSize).toBe(DEFAULT_WATERMARK.fontSize)
  })
})

describe('watermarkLayerStyle', () => {
  it('returns a position:absolute overlay base for disabled config', () => {
    const style = watermarkLayerStyle({ ...DEFAULT_WATERMARK, enabled: false })
    expect(style.position).toBe('absolute')
    expect(style.pointerEvents).toBe('none')
  })

  it('reflects opacity in the style for enabled text watermark', () => {
    const cfg = { ...DEFAULT_WATERMARK, enabled: true, opacity: 0.25 }
    const style = watermarkLayerStyle(cfg)
    expect(style.opacity).toBe(0.25)
  })

  it('does not apply rotation transform to the container style for text watermark (rotation is on inner span)', () => {
    // Rotation was moved from the container div style to the inner <span> in WatermarkLayer
    // so the container stays axis-aligned and its corners do not bleed outside page bounds.
    const cfg = { ...DEFAULT_WATERMARK, enabled: true, rotation: -45 }
    const style = watermarkLayerStyle(cfg)
    expect(style.transform).toBeUndefined()
  })

  it('sets backgroundImage for image watermark', () => {
    const cfg = {
      ...DEFAULT_WATERMARK,
      enabled: true,
      kind: 'image' as const,
      imageUrl: '/logo.png',
    }
    const style = watermarkLayerStyle(cfg)
    expect(style.backgroundImage).toBe('url(/logo.png)')
  })

  it('sets backgroundRepeat repeat for tiled image watermark', () => {
    const cfg = {
      ...DEFAULT_WATERMARK,
      enabled: true,
      kind: 'image' as const,
      imageUrl: '/logo.png',
      tile: true,
    }
    const style = watermarkLayerStyle(cfg)
    expect(style.backgroundRepeat).toBe('repeat')
  })
})
