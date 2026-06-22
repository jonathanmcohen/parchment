import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  FONT_PAIRS,
  parseTheme,
  themeCssVars,
  type WorkspaceTheme,
} from '@/lib/editor/theme'

describe('parseTheme', () => {
  it('accepts a valid #hex accent + known fontPair', () => {
    const t = parseTheme({ accent: '#123abc', fontPair: 'serif' })
    expect(t).toEqual({ accent: '#123abc', fontPair: 'serif' })
  })

  it('rejects a non-hex accent → default accent', () => {
    const t = parseTheme({ accent: 'rebeccapurple', fontPair: 'serif' })
    expect(t.accent).toBe(DEFAULT_THEME.accent)
    expect(t.fontPair).toBe('serif')
  })

  it('rejects an unknown fontPair → default fontPair', () => {
    const t = parseTheme({ accent: '#000000', fontPair: 'nope' })
    expect(t.accent).toBe('#000000')
    expect(t.fontPair).toBe(DEFAULT_THEME.fontPair)
  })

  it('non-object / null raw → full defaults', () => {
    expect(parseTheme(null)).toEqual(DEFAULT_THEME)
    expect(parseTheme('x')).toEqual(DEFAULT_THEME)
    expect(parseTheme(undefined)).toEqual(DEFAULT_THEME)
  })
})

describe('themeCssVars', () => {
  it('maps the accent to --accent-contrast and resolves the pair fonts', () => {
    const theme: WorkspaceTheme = { accent: '#abcdef', fontPair: 'serif' }
    const vars = themeCssVars(theme)
    const serif = FONT_PAIRS.find((p) => p.key === 'serif')
    expect(vars['--accent-contrast']).toBe('#abcdef')
    expect(vars['--font-heading']).toBe(serif?.heading)
    expect(vars['--font-body']).toBe(serif?.body)
  })

  it('falls back to the first pair fonts for an unresolved key', () => {
    // parseTheme would normalize, but themeCssVars must itself be robust.
    const vars = themeCssVars({ accent: '#000000', fontPair: 'does-not-exist' })
    const first = FONT_PAIRS[0]
    expect(vars['--font-heading']).toBe(first?.heading)
    expect(vars['--font-body']).toBe(first?.body)
  })
})

describe('FONT_PAIRS', () => {
  it('is non-empty and every pair has a heading + body', () => {
    expect(FONT_PAIRS.length).toBeGreaterThan(0)
    for (const p of FONT_PAIRS) {
      expect(p.key).toBeTruthy()
      expect(p.name).toBeTruthy()
      expect(p.heading).toBeTruthy()
      expect(p.body).toBeTruthy()
    }
  })
})
