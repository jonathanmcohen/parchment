import { describe, expect, it } from 'vitest'
import {
  DEFAULT_READING_PREFS,
  parseReadingPrefs,
  readingBookmarkKey,
  readingClassNames,
  readingPrefsKey,
} from '@/lib/editor/reading'

describe('DEFAULT_READING_PREFS', () => {
  it('has all flags set to false', () => {
    expect(DEFAULT_READING_PREFS).toEqual({ sepia: false, serif: false, wide: false })
  })
})

describe('parseReadingPrefs', () => {
  it('returns defaults for null', () => {
    expect(parseReadingPrefs(null)).toEqual({ sepia: false, serif: false, wide: false })
  })

  it('returns defaults for a non-object', () => {
    expect(parseReadingPrefs('bad')).toEqual({ sepia: false, serif: false, wide: false })
    expect(parseReadingPrefs(42)).toEqual({ sepia: false, serif: false, wide: false })
    expect(parseReadingPrefs([])).toEqual({ sepia: false, serif: false, wide: false })
    expect(parseReadingPrefs(undefined)).toEqual({ sepia: false, serif: false, wide: false })
  })

  it('coerces truthy values to true', () => {
    expect(parseReadingPrefs({ sepia: 1, serif: 'yes', wide: true })).toEqual({
      sepia: true,
      serif: true,
      wide: true,
    })
  })

  it('coerces falsy values to false', () => {
    expect(parseReadingPrefs({ sepia: 0, serif: '', wide: null })).toEqual({
      sepia: false,
      serif: false,
      wide: false,
    })
  })

  it('treats missing keys as false', () => {
    expect(parseReadingPrefs({})).toEqual({ sepia: false, serif: false, wide: false })
  })

  it('ignores extra unknown keys without error', () => {
    const result = parseReadingPrefs({ sepia: true, serif: false, wide: true, extra: 'ignored' })
    expect(result).toEqual({ sepia: true, serif: false, wide: true })
  })
})

describe('readingClassNames', () => {
  it('always includes the base class', () => {
    const cls = readingClassNames({ sepia: false, serif: false, wide: false })
    expect(cls).toContain('parchment-reading')
  })

  it('adds sepia modifier when sepia is true', () => {
    const cls = readingClassNames({ sepia: true, serif: false, wide: false })
    expect(cls).toContain('parchment-reading--sepia')
    expect(cls).not.toContain('parchment-reading--serif')
    expect(cls).not.toContain('parchment-reading--wide')
  })

  it('adds serif modifier when serif is true', () => {
    const cls = readingClassNames({ sepia: false, serif: true, wide: false })
    expect(cls).toContain('parchment-reading--serif')
    expect(cls).not.toContain('parchment-reading--sepia')
    expect(cls).not.toContain('parchment-reading--wide')
  })

  it('adds wide modifier when wide is true', () => {
    const cls = readingClassNames({ sepia: false, serif: false, wide: true })
    expect(cls).toContain('parchment-reading--wide')
    expect(cls).not.toContain('parchment-reading--sepia')
    expect(cls).not.toContain('parchment-reading--serif')
  })

  it('adds all three modifiers when all flags are true', () => {
    const cls = readingClassNames({ sepia: true, serif: true, wide: true })
    expect(cls).toContain('parchment-reading')
    expect(cls).toContain('parchment-reading--sepia')
    expect(cls).toContain('parchment-reading--serif')
    expect(cls).toContain('parchment-reading--wide')
  })

  it('produces exactly the base class when all flags are false', () => {
    const cls = readingClassNames({ sepia: false, serif: false, wide: false })
    expect(cls).toBe('parchment-reading')
  })
})

describe('readingPrefsKey', () => {
  it('returns the expected global key', () => {
    expect(readingPrefsKey()).toBe('parchment:reading-prefs')
  })
})

describe('readingBookmarkKey', () => {
  it('returns a per-doc key containing the docId', () => {
    expect(readingBookmarkKey('abc-123')).toBe('parchment:reading-bookmark:abc-123')
  })

  it('handles special characters in docId', () => {
    expect(readingBookmarkKey('doc/with:colon')).toBe('parchment:reading-bookmark:doc/with:colon')
  })
})
