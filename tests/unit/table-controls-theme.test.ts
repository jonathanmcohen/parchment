import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// v0.2.10 table UX — theming guards for the new hover chrome (grips + "+" strips
// + row/col menu + resize handle). The chrome sits ON the page sheet, so its
// resting fill must read the PAGE tokens (--page-surface-muted / --page-border /
// --page-ink-muted) — the same discipline as the F2b table header — so it stays
// legible on light, sepia AND the dark page. The pick highlight may use the
// chrome accent (--primary). These static guards pin that wiring so a future edit
// can't silently revert the chrome to scheme tokens that wash out on a dark page.

const ROOT = join(__dirname, '..', '..')
const globalsCss = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')

/** Extract a single CSS rule block by its selector header (first match). */
function ruleBody(css: string, selectorHeader: string): string {
  const idx = css.indexOf(selectorHeader)
  expect(idx, `selector not found: ${selectorHeader}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('table grip theming', () => {
  it('grip resting fill uses page tokens, not the chrome --surface/--border', () => {
    const grip = ruleBody(globalsCss, '.parchment-table-grip {')
    expect(grip).toContain('var(--page-surface-muted)')
    expect(grip).toContain('var(--page-border)')
    // Must NOT read the chrome scheme surface/border (would mismatch the sheet).
    expect(grip).not.toContain('background: var(--surface)')
  })

  it('grip hover/focus highlight uses the accent (--primary)', () => {
    const hover = ruleBody(globalsCss, '.parchment-table-grip:hover,')
    expect(hover).toContain('var(--primary)')
  })
})

describe('add-strip theming', () => {
  it('add-strip resting state uses page tokens', () => {
    const strip = ruleBody(globalsCss, '.parchment-table-addstrip {')
    expect(strip).toContain('var(--page-surface-muted)')
    expect(strip).toContain('var(--page-border)')
  })

  it('add-strip hover uses the accent', () => {
    const hover = ruleBody(globalsCss, '.parchment-table-addstrip:hover,')
    expect(hover).toContain('var(--primary)')
  })
})

describe('resize handle + selection highlight', () => {
  it('column resize handle uses --primary (reads on light and dark page)', () => {
    const handle = ruleBody(globalsCss, '.parchment-prose table .column-resize-handle {')
    expect(handle).toContain('background: var(--primary)')
  })

  it('dark-page selected-cell highlight is defined so a row/col selection is visible', () => {
    // A dedicated [data-page-bg="dark"] rule ensures the fill shows on the dark sheet.
    const darkSel = ruleBody(
      globalsCss,
      '[data-page-bg="dark"] .parchment-prose table .selectedCell {',
    )
    expect(darkSel).toContain('var(--primary)')
  })

  it('base selected-cell highlight outlines with the accent (visible in every scheme)', () => {
    const sel = ruleBody(globalsCss, '.parchment-prose table .selectedCell {')
    expect(sel).toContain('var(--primary)')
  })
})

describe('overlay reveal', () => {
  it('overlay chrome is hidden until data-active', () => {
    const base = ruleBody(globalsCss, '.parchment-table-overlay {')
    expect(base).toContain('opacity: 0')
    const active = ruleBody(globalsCss, '.parchment-table-overlay[data-active="true"] {')
    expect(active).toContain('opacity: 1')
  })
})
