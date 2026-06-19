import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAG_COLOR,
  TAG_COLORS,
  isValidTagColor,
  resolveTagColor,
} from '@/lib/docs/tag-colors'

describe('tag-colors', () => {
  it('TAG_COLORS has exactly 8 entries', () => {
    expect(TAG_COLORS).toHaveLength(8)
  })

  it('each color has name, bg, and fg strings', () => {
    for (const color of TAG_COLORS) {
      expect(typeof color.name).toBe('string')
      expect(color.name.length).toBeGreaterThan(0)
      expect(typeof color.bg).toBe('string')
      expect(color.bg).toMatch(/^#[0-9a-f]{6}$/i)
      expect(typeof color.fg).toBe('string')
      expect(color.fg).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('resolveTagColor returns the correct entry for a known color', () => {
    const result = resolveTagColor('red')
    expect(result.name).toBe('red')
    expect(result.bg).toBe('#dc2626')
  })

  it('resolveTagColor falls back to DEFAULT_TAG_COLOR for unknown name', () => {
    const result = resolveTagColor('notacolor')
    const defaultEntry = resolveTagColor(DEFAULT_TAG_COLOR)
    expect(result).toEqual(defaultEntry)
  })

  it('isValidTagColor returns true for known palette names', () => {
    for (const color of TAG_COLORS) {
      expect(isValidTagColor(color.name)).toBe(true)
    }
  })

  it('isValidTagColor returns false for unknown names', () => {
    expect(isValidTagColor('notacolor')).toBe(false)
    expect(isValidTagColor('')).toBe(false)
    expect(isValidTagColor('purple')).toBe(false)
  })
})
