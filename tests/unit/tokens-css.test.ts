import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// S1-7: tokens.css is the single source of truth for every color/elevation/font
// token. This guard asserts the :root (light) block DECLARES every name in the
// canonical vocabulary, so an accidental drop during extraction/refactor fails
// the unit gate instead of silently falling back to a literal at runtime (the
// `var(--surface-hover, #f9fafb)` trap the plan calls out).

const tokensCss = readFileSync(
  fileURLToPath(new URL('../../src/styles/tokens.css', import.meta.url)),
  'utf8',
)

/** Every token the canonical vocabulary (plan-S1.md) requires S1-7 to mint. */
const REQUIRED_TOKENS = [
  // core ink
  '--background',
  '--foreground',
  '--muted',
  '--paper',
  // fixed brand
  '--primary',
  '--primary-hover',
  '--primary-pressed',
  '--primary-surface',
  '--on-primary',
  // user accent (picker default)
  '--accent',
  '--accent-contrast',
  // surfaces
  '--surface',
  '--surface-muted',
  '--surface-hover',
  '--border',
  '--border-chrome',
  // editor
  '--editor-gutter',
  '--selection-bg',
  '--code-bg',
  '--highlight',
  '--star',
  '--tooltip-bg',
  // elevation
  '--shadow-page',
  '--shadow-dropdown',
  '--shadow-dialog',
  // semantic
  '--link',
  '--error',
  '--warning',
  '--success',
  '--info',
  // fonts (S1-8 defaults)
  '--font-ui',
  '--font-body',
  '--font-mono',
] as const

describe('tokens.css canonical vocabulary', () => {
  it.each(REQUIRED_TOKENS)('declares %s', (token) => {
    // A declaration is `<token>:` somewhere in the file (a value, not just a
    // var() reference, which would be `var(<token>` — exclude that form).
    const declRe = new RegExp(`(^|[^a-z(])${token}\\s*:`, 'm')
    expect(declRe.test(tokensCss)).toBe(true)
  })

  it('defines a dark-scheme block so theme toggle is a pure var swap', () => {
    expect(tokensCss).toMatch(/\[data-color-scheme="dark"\]/)
  })

  it('keeps the high-contrast palette (light + dark) in the token file', () => {
    expect(tokensCss).toMatch(/\[data-high-contrast="true"\]/)
  })

  it('preserves the I1 :root:has() dark-propagation rule', () => {
    expect(tokensCss).toMatch(/:root:has\(\[data-color-scheme="dark"\]\)/)
  })

  it('sets the fixed brand --primary to Google blue in light scheme', () => {
    // The first --primary declaration (the :root/light block) must be #1A73E8.
    const m = tokensCss.match(/--primary:\s*(#[0-9a-fA-F]{6})/)
    expect(m?.[1]?.toLowerCase()).toBe('#1a73e8')
  })

  it('no longer carries the cream/purple identity literals', () => {
    // The retired brand/surface literals must not reappear in the token file.
    for (const dead of ['#7c5cff', '#6d28d9', '#f7f6f3', '#f5efe0']) {
      expect(tokensCss.toLowerCase()).not.toContain(dead)
    }
  })
})
