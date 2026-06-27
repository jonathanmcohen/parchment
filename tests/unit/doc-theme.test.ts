// J12-1: pure per-doc theme override. NO db / no React. Validates a stored
// documents.meta.theme blob against an ALLOW-LIST (no arbitrary CSS — that is the
// separate sanitized custom-css path) and resolves it to CSS token vars.

import { describe, expect, it } from 'vitest'
import {
  DOC_THEME_PRESETS,
  isDocThemePreset,
  parseDocTheme,
  resolveDocThemeVars,
} from '@/lib/editor/doc-theme'

describe('parseDocTheme', () => {
  it('returns an empty override for absent / malformed input', () => {
    expect(parseDocTheme(undefined)).toEqual({})
    expect(parseDocTheme(null)).toEqual({})
    expect(parseDocTheme('nope')).toEqual({})
    expect(parseDocTheme(42)).toEqual({})
  })

  it('keeps a known preset key', () => {
    const t = parseDocTheme({ preset: 'sepia' })
    expect(t.preset).toBe('sepia')
  })

  it('drops an unknown preset key', () => {
    const t = parseDocTheme({ preset: 'neon-disco' })
    expect(t.preset).toBeUndefined()
  })

  it('keeps a valid #hex accent and drops a bad one', () => {
    expect(parseDocTheme({ accent: '#aabbcc' }).accent).toBe('#aabbcc')
    expect(parseDocTheme({ accent: 'red' }).accent).toBeUndefined()
    expect(parseDocTheme({ accent: 'javascript:alert(1)' }).accent).toBeUndefined()
  })

  it('keeps a valid pageBg preset and drops junk', () => {
    expect(parseDocTheme({ pageBg: 'dark' }).pageBg).toBe('dark')
    expect(parseDocTheme({ pageBg: 'rainbow' }).pageBg).toBeUndefined()
  })

  it('drops unknown keys entirely (no arbitrary CSS leaks through)', () => {
    const t = parseDocTheme({ preset: 'sepia', background: 'url(evil)', '--x': 'y' }) as Record<
      string,
      unknown
    >
    expect(t.preset).toBe('sepia')
    expect(t.background).toBeUndefined()
    expect(t['--x']).toBeUndefined()
  })
})

describe('resolveDocThemeVars', () => {
  it('returns no vars when there is no override', () => {
    expect(resolveDocThemeVars({})).toEqual({})
  })

  it('resolves a preset to token vars (only token custom-properties, no raw CSS)', () => {
    const vars = resolveDocThemeVars({ preset: 'sepia' })
    // Every key is a CSS custom property; every value is a primitive string.
    for (const [k, v] of Object.entries(vars)) {
      expect(k.startsWith('--')).toBe(true)
      expect(typeof v).toBe('string')
      // No raw declarations / selectors / braces could ride along.
      expect(v).not.toMatch(/[{};]/)
    }
    expect(Object.keys(vars).length).toBeGreaterThan(0)
  })

  it('an accent override emits --accent', () => {
    const vars = resolveDocThemeVars({ accent: '#123456' })
    expect(vars['--accent']).toBe('#123456')
  })

  it('a pageBg override emits --page-bg', () => {
    const vars = resolveDocThemeVars({ pageBg: 'sepia' })
    expect(vars['--page-bg']).toBeDefined()
  })

  it('a dark page override also flips the in-page ink vars', () => {
    const vars = resolveDocThemeVars({ pageBg: 'dark' })
    expect(vars['--page-bg']).toBeDefined()
    expect(vars['--page-ink']).toBeDefined()
  })

  it('never emits a value containing a CSS break-out character', () => {
    // Even a hostile-looking (but allow-list-rejected) input yields safe output.
    const vars = resolveDocThemeVars(parseDocTheme({ accent: '#fff;}body{display:none' }))
    for (const v of Object.values(vars)) {
      expect(v).not.toMatch(/[{};]/)
    }
  })
})

describe('isDocThemePreset', () => {
  it('recognizes the bundled presets', () => {
    for (const p of DOC_THEME_PRESETS) expect(isDocThemePreset(p.key)).toBe(true)
  })
  it('rejects anything else', () => {
    expect(isDocThemePreset('whatever')).toBe(false)
    expect(isDocThemePreset(123)).toBe(false)
  })
})
