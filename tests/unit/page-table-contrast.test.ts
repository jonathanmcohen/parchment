import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ── F2b: prose table header readable on the PAGE sheet (F2 follow-on) ─────────
//
// The bug: `.parchment-prose table th { background: var(--border) }` and the
// cell/header border + even-row tint all read the CHROME --border (#5f6368 in
// dark). The page is always a light sheet and prose ink is --page-ink (#202124,
// scheme-independent), so in dark mode the table HEADER rendered dark ink on a
// dark-grey fill ≈ 2.66:1 — below WCAG AA.
//
// The fix mirrors F2's --page-ink exactly: page-scoped --page-surface-muted
// (header/zebra fill) + --page-border (cell + header borders), scheme-
// INDEPENDENT for normal light/dark/system (NO dark override), flipping only in
// the HC blocks. The th text color stays the prose --page-ink (unchanged).
//
// These are static source guards pinning the token WIRING so a future edit can't
// silently revert the header fill to the chrome --border.

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

/** WCAG relative-luminance + contrast ratio for #rrggbb pairs. */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m?.[1]) throw new Error(`bad hex: ${hex}`)
  const n = Number.parseInt(m[1], 16)
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const r = channel((n >> 16) & 0xff)
  const g = channel((n >> 8) & 0xff)
  const b = channel(n & 0xff)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

describe('F2b — page-table token wiring', () => {
  it('.parchment-prose table th fills with --page-surface-muted, never the chrome --border', () => {
    const th = ruleBody(globalsCss, '.parchment-prose table th {')
    expect(th).toContain('background: var(--page-surface-muted)')
    // The regression guard: header fill must NOT read the chrome scheme border.
    expect(th).not.toContain('var(--border)')
  })

  it('table th/td borders use --page-border, not the chrome --border', () => {
    const cells = ruleBody(globalsCss, '.parchment-prose table th,\n.parchment-prose table td {')
    expect(cells).toContain('border: 1px solid var(--page-border)')
    expect(cells).not.toContain('var(--border)')
  })

  it('even-row zebra tint mixes the page token, not the chrome --border', () => {
    const zebra = ruleBody(globalsCss, '.parchment-prose table tbody tr:nth-child(even) td {')
    expect(zebra).toContain('var(--page-surface-muted)')
    expect(zebra).not.toContain('var(--border)')
  })

  it('base/light defines page table surfaces (#f1f3f4 fill, #dadce0 border) for the light sheet', () => {
    const base = ruleBody(tokensCss, ':root,\n[data-color-scheme="light"] {')
    expect(base).toMatch(/--page-surface-muted:\s*#f1f3f4/)
    expect(base).toMatch(/--page-border:\s*#dadce0/)
  })

  it('CRUX: dark/system-dark schemes do NOT override the page table tokens (page stays a light sheet)', () => {
    const darkBlock = ruleBody(tokensCss, '[data-color-scheme="dark"] {')
    expect(darkBlock).not.toContain('--page-surface-muted')
    expect(darkBlock).not.toContain('--page-border')
    const systemDark = ruleBody(tokensCss, '[data-color-scheme="system"] {')
    expect(systemDark).not.toContain('--page-surface-muted')
    expect(systemDark).not.toContain('--page-border')
  })

  it('HC blocks flip the page table tokens (HC-light grey/black, HC-dark near-black/white)', () => {
    const hcLight = ruleBody(
      tokensCss,
      '[data-high-contrast="true"],\n[data-high-contrast="true"][data-color-scheme="light"] {',
    )
    expect(hcLight).toMatch(/--page-surface-muted:\s*#e8e8e8/)
    expect(hcLight).toMatch(/--page-border:\s*#000000/)

    const hcDark = ruleBody(tokensCss, '[data-high-contrast="true"][data-color-scheme="dark"] {')
    expect(hcDark).toMatch(/--page-surface-muted:\s*#1a1a1a/)
    expect(hcDark).toMatch(/--page-border:\s*#ffffff/)

    const hcSystemDark = ruleBody(
      tokensCss,
      '[data-high-contrast="true"][data-color-scheme="system"] {',
    )
    expect(hcSystemDark).toMatch(/--page-surface-muted:\s*#1a1a1a/)
    expect(hcSystemDark).toMatch(/--page-border:\s*#ffffff/)
  })
})

describe('F2b — th ink-on-fill contrast ≥ 4.5:1 across schemes', () => {
  // th text is the prose --page-ink; th fill is --page-surface-muted.
  const cases: Array<[string, string, string]> = [
    ['light', '#202124', '#f1f3f4'],
    // dark/system are scheme-independent → SAME dark ink on SAME light fill (the fix).
    ['dark (scheme-independent)', '#202124', '#f1f3f4'],
    ['system (scheme-independent)', '#202124', '#f1f3f4'],
    ['HC-light', '#000000', '#e8e8e8'],
    ['HC-dark', '#ffffff', '#1a1a1a'],
  ]

  for (const [name, ink, fill] of cases) {
    it(`${name}: ${ink} on ${fill} ≥ 4.5:1`, () => {
      expect(contrast(ink, fill)).toBeGreaterThanOrEqual(4.5)
    })
  }
})
