import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ── F2: page-body ink contrasts the PAGE canvas, not the chrome scheme ────────
//
// The bug: `.parchment-prose { color: var(--foreground) }`. In dark chrome
// --foreground is #E8EAED (LIGHT ink for a dark bg), but the page is a WHITE
// sheet (pageBg defaults to white and is NOT flipped by colorScheme) →
// light-grey #E8EAED on white #ffffff measured 1.21:1, unreadable.
//
// The fix: a page-scoped --page-ink token, dark (#202124) for the white/sepia
// sheet and scheme-INDEPENDENT for the normal schemes (NO dark override). Only
// the HC blocks — whose --page-bg actually flips to black — re-point ink white.
//
// These are static source guards: they pin the token WIRING in the CSS so a
// future edit can't silently reintroduce the regression (revert prose to
// --foreground, or add a dark override of --page-ink).

const ROOT = join(__dirname, '..', '..')
const globalsCss = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')
const tokensCss = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8')

/** Extract a single CSS rule block by its selector header (first match). */
function ruleBody(css: string, selectorHeader: string): string {
  const idx = css.indexOf(selectorHeader)
  expect(idx, `selector not found: ${selectorHeader}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('F2 — page-ink token wiring', () => {
  it('.parchment-prose colors the body with --page-ink, never the chrome --foreground', () => {
    const body = ruleBody(globalsCss, '.parchment-prose {')
    expect(body).toContain('color: var(--page-ink)')
    // The regression guard: prose must NOT read the chrome scheme ink.
    expect(body).not.toContain('var(--foreground)')
  })

  it('the H1–H6 heading ramp uses --page-ink, not --foreground', () => {
    const ramp = ruleBody(
      globalsCss,
      '.parchment-prose h1,\n.parchment-prose h2,\n.parchment-prose h3,\n.parchment-prose h4,\n.parchment-prose h5,\n.parchment-prose h6 {',
    )
    expect(ramp).toContain('color: var(--page-ink)')
    expect(ramp).not.toContain('var(--foreground)')
  })

  it('prose muted surfaces (subtitle, blockquote, placeholder, done-task) use --page-ink-muted', () => {
    expect(ruleBody(globalsCss, '.parchment-doc-subtitle {')).toContain('var(--page-ink-muted)')
    expect(ruleBody(globalsCss, '.parchment-prose blockquote {')).toContain('var(--page-ink-muted)')
    expect(
      ruleBody(globalsCss, '.parchment-prose p.is-editor-empty:first-child::before {'),
    ).toContain('var(--page-ink-muted)')
  })

  it('base/light defines dark page-ink #202124 for the light sheet', () => {
    const base = ruleBody(tokensCss, ':root,\n[data-color-scheme="light"] {')
    expect(base).toMatch(/--page-ink:\s*#202124/)
    expect(base).toMatch(/--page-ink-muted:\s*#5f6368/)
  })

  it('CRUX: dark/system-dark schemes do NOT override --page-ink (page stays a light sheet → ink stays dark)', () => {
    const darkBlock = ruleBody(tokensCss, '[data-color-scheme="dark"] {')
    expect(darkBlock).not.toContain('--page-ink')
    const systemDark = ruleBody(tokensCss, '[data-color-scheme="system"] {')
    expect(systemDark).not.toContain('--page-ink')
  })

  it('HC-light keeps black ink (white page); HC-dark flips ink white (black page)', () => {
    // HC-light: white page → black ink.
    const hcLight = ruleBody(
      tokensCss,
      '[data-high-contrast="true"],\n[data-high-contrast="true"][data-color-scheme="light"] {',
    )
    expect(hcLight).toMatch(/--page-ink:\s*#000000/)

    // HC-dark (forced): black page → white ink.
    const hcDark = ruleBody(tokensCss, '[data-high-contrast="true"][data-color-scheme="dark"] {')
    expect(hcDark).toMatch(/--page-ink:\s*#ffffff/)
    expect(hcDark).toMatch(/--page-ink-muted:\s*#e8e8e8/)

    // HC-dark (system + OS dark): same black page → white ink.
    const hcSystemDark = ruleBody(
      tokensCss,
      '[data-high-contrast="true"][data-color-scheme="system"] {',
    )
    expect(hcSystemDark).toMatch(/--page-ink:\s*#ffffff/)
  })
})
