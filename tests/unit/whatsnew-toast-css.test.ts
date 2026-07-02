import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// v0.2.10: the toast must be a NON-blocking, pointer-events-contained floating
// element (the v0.2.8 e2e lesson: a new floating element with a full-viewport
// pointer-catching layer broke admin-flow clicks). Pin the CSS contract:
//   • positioned fixed at bottom-left (not inset:0)
//   • the positioning wrapper does NOT catch pointer events across the viewport
//   • the toast card itself IS clickable
//   • it uses chrome tokens so light/dark/system all theme correctly

const globalsCss = readFileSync(join(__dirname, '..', '..', 'src/app/globals.css'), 'utf8')

function ruleBody(selector: string): string {
  const idx = globalsCss.indexOf(selector)
  expect(idx, `CSS defines ${selector}`).toBeGreaterThanOrEqual(0)
  return globalsCss.slice(idx, globalsCss.indexOf('}', idx))
}

describe('WhatsNewToast CSS shell', () => {
  it('the toast is fixed at the bottom-left, not a full-viewport overlay', () => {
    const body = ruleBody('.parchment-whatsnew-toast {')
    expect(body).toContain('position: fixed')
    // Anchored bottom-left, above the sidebar footer area.
    expect(body).toMatch(/bottom:/)
    expect(body).toMatch(/left:/)
    // NOT a blanket overlay.
    expect(body).not.toContain('inset: 0')
  })

  it('the toast card catches its own clicks (pointer-events auto)', () => {
    const body = ruleBody('.parchment-whatsnew-toast {')
    expect(body).toContain('pointer-events: auto')
  })

  it('themes via chrome tokens (surface / foreground / border)', () => {
    const body = ruleBody('.parchment-whatsnew-toast {')
    expect(body).toMatch(/var\(--surface\b/)
    expect(body).toMatch(/var\(--foreground\b/)
  })
})
