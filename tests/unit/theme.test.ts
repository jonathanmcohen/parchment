import { describe, expect, it } from 'vitest'
import {
  ACCENT_SWATCHES,
  DARK_PAGE_VARS,
  DEFAULT_THEME,
  FONT_PAIRS,
  isDarkPage,
  PAGE_BG_PRESETS,
  parseTheme,
  resolvePageBg,
  themeCssVars,
  type WorkspaceTheme,
} from '@/lib/editor/theme'

describe('parseTheme', () => {
  it('accepts a valid #hex accent + known fontPair', () => {
    const t = parseTheme({ accent: '#123abc', fontPair: 'serif' })
    expect(t.accent).toBe('#123abc')
    expect(t.fontPair).toBe('serif')
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

  // I1: colorScheme
  it('accepts valid colorScheme values', () => {
    expect(
      parseTheme({ accent: '#000000', fontPair: 'system', colorScheme: 'light' }).colorScheme,
    ).toBe('light')
    expect(
      parseTheme({ accent: '#000000', fontPair: 'system', colorScheme: 'dark' }).colorScheme,
    ).toBe('dark')
    expect(
      parseTheme({ accent: '#000000', fontPair: 'system', colorScheme: 'system' }).colorScheme,
    ).toBe('system')
  })

  it('invalid colorScheme → default system', () => {
    const t = parseTheme({ accent: '#000000', fontPair: 'system', colorScheme: 'midnight' })
    expect(t.colorScheme).toBe('system')
  })

  it('legacy value without colorScheme/pageBg → defaults, never breaks', () => {
    const t = parseTheme({ accent: '#6d28d9', fontPair: 'serif' })
    expect(t.colorScheme).toBe(DEFAULT_THEME.colorScheme)
    expect(t.pageBg).toBe(DEFAULT_THEME.pageBg)
    // existing fields still correct
    expect(t.accent).toBe('#6d28d9')
    expect(t.fontPair).toBe('serif')
  })

  // K2: highContrast / dyslexicFont
  it('legacy value without highContrast/dyslexicFont → both false (compat)', () => {
    const t = parseTheme({ accent: '#6d28d9', fontPair: 'serif' })
    expect(t.highContrast).toBe(false)
    expect(t.dyslexicFont).toBe(false)
  })

  it('preserves highContrast/dyslexicFont when present', () => {
    const t = parseTheme({
      accent: '#000000',
      fontPair: 'system',
      highContrast: true,
      dyslexicFont: true,
    })
    expect(t.highContrast).toBe(true)
    expect(t.dyslexicFont).toBe(true)
  })

  it('preserves a mixed pair (one on, one off)', () => {
    const t = parseTheme({
      accent: '#000000',
      fontPair: 'system',
      highContrast: true,
      dyslexicFont: false,
    })
    expect(t.highContrast).toBe(true)
    expect(t.dyslexicFont).toBe(false)
  })

  it('coerces a non-boolean highContrast/dyslexicFont to false', () => {
    // Truthy-but-not-true values must NOT enable the toggle.
    const t = parseTheme({
      accent: '#000000',
      fontPair: 'system',
      highContrast: 'true',
      dyslexicFont: 1,
    })
    expect(t.highContrast).toBe(false)
    expect(t.dyslexicFont).toBe(false)
  })

  // I1: pageBg
  it('accepts pageBg keyword presets', () => {
    expect(parseTheme({ accent: '#000000', fontPair: 'system', pageBg: 'white' }).pageBg).toBe(
      'white',
    )
    expect(parseTheme({ accent: '#000000', fontPair: 'system', pageBg: 'sepia' }).pageBg).toBe(
      'sepia',
    )
  })

  it('accepts pageBg as a #hex string', () => {
    expect(parseTheme({ accent: '#000000', fontPair: 'system', pageBg: '#f0e8d0' }).pageBg).toBe(
      '#f0e8d0',
    )
  })

  it('invalid pageBg → default white', () => {
    const t = parseTheme({ accent: '#000000', fontPair: 'system', pageBg: 'yellowish' })
    expect(t.pageBg).toBe(DEFAULT_THEME.pageBg)
  })

  // #8 (v0.1.9): the dark document page is an accepted preset keyword.
  it("accepts the 'dark' pageBg preset", () => {
    expect(parseTheme({ accent: '#000000', fontPair: 'system', pageBg: 'dark' }).pageBg).toBe(
      'dark',
    )
  })
})

describe('DEFAULT_THEME', () => {
  it('has highContrast and dyslexicFont both false by default', () => {
    expect(DEFAULT_THEME.highContrast).toBe(false)
    expect(DEFAULT_THEME.dyslexicFont).toBe(false)
  })
})

describe('themeCssVars', () => {
  it('maps the accent to --accent-contrast and resolves the pair fonts', () => {
    const theme: WorkspaceTheme = {
      accent: '#abcdef',
      fontPair: 'serif',
      colorScheme: 'system',
      pageBg: 'white',
      highContrast: false,
      dyslexicFont: false,
    }
    const vars = themeCssVars(theme)
    const serif = FONT_PAIRS.find((p) => p.key === 'serif')
    expect(vars['--accent-contrast']).toBe('#abcdef')
    expect(vars['--font-heading']).toBe(serif?.heading)
    expect(vars['--font-body']).toBe(serif?.body)
  })

  it('emits both accent tokens so links + accent surfaces track the picker', () => {
    const theme: WorkspaceTheme = {
      accent: '#abcdef',
      fontPair: 'serif',
      colorScheme: 'system',
      pageBg: 'white',
      highContrast: false,
      dyslexicFont: false,
    }
    const vars = themeCssVars(theme)
    // The bare --accent powers links, selections and color-mix surfaces; it must
    // track the chosen accent alongside --accent-contrast (buttons/focus rings).
    expect(vars['--accent']).toBe(theme.accent)
    expect(vars['--accent-contrast']).toBe(theme.accent)
  })

  it('falls back to the first pair fonts for an unresolved key', () => {
    // parseTheme would normalize, but themeCssVars must itself be robust.
    const vars = themeCssVars({
      accent: '#000000',
      fontPair: 'does-not-exist',
      colorScheme: 'system',
      pageBg: 'white',
      highContrast: false,
      dyslexicFont: false,
    })
    const first = FONT_PAIRS[0]
    expect(vars['--font-heading']).toBe(first?.heading)
    expect(vars['--font-body']).toBe(first?.body)
  })

  // I1: --page-bg
  it('emits --page-bg resolved from the white keyword', () => {
    const vars = themeCssVars({
      accent: '#000000',
      fontPair: 'system',
      colorScheme: 'system',
      pageBg: 'white',
      highContrast: false,
      dyslexicFont: false,
    })
    expect(vars['--page-bg']).toBe('#ffffff')
  })

  it('emits --page-bg resolved from the sepia keyword', () => {
    const vars = themeCssVars({
      accent: '#000000',
      fontPair: 'system',
      colorScheme: 'system',
      pageBg: 'sepia',
      highContrast: false,
      dyslexicFont: false,
    })
    expect(vars['--page-bg']).toBe('#f5efe0')
  })

  it('emits --page-bg passthrough for a custom #hex pageBg', () => {
    const vars = themeCssVars({
      accent: '#000000',
      fontPair: 'system',
      colorScheme: 'system',
      pageBg: '#ffe4c4',
      highContrast: false,
      dyslexicFont: false,
    })
    expect(vars['--page-bg']).toBe('#ffe4c4')
  })

  // #8 (v0.1.9): dark document page
  const baseTheme = (pageBg: string): WorkspaceTheme => ({
    accent: '#000000',
    fontPair: 'system',
    colorScheme: 'system',
    pageBg,
    highContrast: false,
    dyslexicFont: false,
  })

  it("emits the dark page canvas + ink + code-bg for pageBg 'dark'", () => {
    const vars = themeCssVars(baseTheme('dark'))
    expect(vars['--page-bg']).toBe('#1e1f22')
    expect(vars['--page-ink']).toBe('#e8eaed')
    expect(vars['--page-ink-muted']).toBe('#9aa0a6')
    expect(vars['--page-surface-muted']).toBe('#2a2c30')
    expect(vars['--page-border']).toBe('#3c4043')
    // Code blocks follow the dark page onto a dark surface.
    expect(vars['--code-bg']).toBe('#1b1c1f')
    // v0.2.2: a dark page must darken its own paged-editor gutter trough so a
    // dark sheet never floats on the light chrome gutter (UI scheme = light).
    expect(vars['--page-gutter']).toBe('#161719')
  })

  it("does NOT override page-scoped vars for 'paper'/sepia/white/custom (stays light)", () => {
    // 'paper' is not a preset keyword → parseTheme would reject it, but
    // themeCssVars must itself never emit dark overrides for any non-'dark' value.
    for (const pageBg of ['paper', 'sepia', 'white', '#f0e8d0']) {
      const vars = themeCssVars(baseTheme(pageBg))
      expect(vars['--page-ink']).toBeUndefined()
      expect(vars['--page-ink-muted']).toBeUndefined()
      expect(vars['--page-surface-muted']).toBeUndefined()
      expect(vars['--page-border']).toBeUndefined()
      expect(vars['--code-bg']).toBeUndefined()
      // No page-scoped gutter override → the paged container falls back to the
      // chrome --editor-gutter (light/sepia/custom pages keep prior behavior).
      expect(vars['--page-gutter']).toBeUndefined()
    }
  })

  it("'sepia' page keeps its light canvas and emits no dark code-bg", () => {
    const vars = themeCssVars(baseTheme('sepia'))
    expect(vars['--page-bg']).toBe('#f5efe0')
    expect(vars['--code-bg']).toBeUndefined()
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

  // S4-1: Inter is dropped — Google Docs uses Arial body / Roboto chrome.
  it('has no inter pair (Inter dropped in S4)', () => {
    expect(FONT_PAIRS.some((p) => p.key === 'inter')).toBe(false)
  })

  it("the default 'system' pair body is Arial-first (Docs body face)", () => {
    const sys = FONT_PAIRS.find((p) => p.key === 'system')
    expect(sys).toBeDefined()
    expect(sys?.body.startsWith('Arial')).toBe(true)
  })

  it("the 'mono' pair body uses Roboto Mono", () => {
    const mono = FONT_PAIRS.find((p) => p.key === 'mono')
    expect(mono).toBeDefined()
    expect(mono?.body).toContain('Roboto Mono')
  })

  it('exposes exactly the four S4 pairs (system, serif, mono, classic)', () => {
    expect(FONT_PAIRS.map((p) => p.key)).toEqual(['system', 'serif', 'mono', 'classic'])
  })
})

describe('ACCENT_SWATCHES', () => {
  it('has exactly 8 entries, all valid #hex', () => {
    expect(ACCENT_SWATCHES.length).toBe(8)
    const hexRe = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
    for (const s of ACCENT_SWATCHES) {
      expect(hexRe.test(s)).toBe(true)
    }
  })
})

describe('PAGE_BG_PRESETS', () => {
  it('includes white and sepia presets', () => {
    const keys = PAGE_BG_PRESETS.map((p) => p.key)
    expect(keys).toContain('white')
    expect(keys).toContain('sepia')
  })

  // #8 (v0.1.9): the dark page is a selectable preset with a label.
  it('includes a dark preset with a label so the settings control renders it', () => {
    const dark = PAGE_BG_PRESETS.find((p) => p.value === 'dark')
    expect(dark).toBeDefined()
    expect(dark?.label).toBeTruthy()
  })
})

// #8 (v0.1.9): dark page helpers
describe('resolvePageBg / isDarkPage', () => {
  it("resolves 'dark' to the dark canvas colour and flags it as a dark page", () => {
    expect(resolvePageBg('dark')).toBe('#1e1f22')
    expect(isDarkPage('dark')).toBe(true)
  })

  it('does not flag white / sepia / custom-hex as dark', () => {
    expect(isDarkPage('white')).toBe(false)
    expect(isDarkPage('sepia')).toBe(false)
    expect(isDarkPage('#1e1f22')).toBe(false)
    // The dark canvas colour as a literal hex is NOT the 'dark' keyword.
    expect(resolvePageBg('white')).toBe('#ffffff')
    expect(resolvePageBg('sepia')).toBe('#f5efe0')
  })

  it('DARK_PAGE_VARS carries the legible light-on-dark page palette + dark code-bg', () => {
    expect(DARK_PAGE_VARS['--page-ink']).toBe('#e8eaed')
    expect(DARK_PAGE_VARS['--code-bg']).toBe('#1b1c1f')
  })

  it('DARK_PAGE_VARS darkens the page-scoped gutter trough (v0.2.2)', () => {
    // Darker than the #1e1f22 sheet so sheets float above the trough, mirroring
    // the white-sheet-on-#f1f3f4 relationship in light mode.
    expect(DARK_PAGE_VARS['--page-gutter']).toBe('#161719')
  })
})
