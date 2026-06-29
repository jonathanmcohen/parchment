import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// v0.2.2 #5: the A1 pagination only fixed PAGED mode. CONTINUOUS mode
// (data-page-layout="continuous") still rendered the dashed "Page N" boundary
// overlays (.parchment-page-boundary → .parchment-page-divider) and the legacy
// .parchment-page-break line, so a multi-page doc showed page indicators and let
// text flow through them. Continuous = clean pageless flow. This is a static
// source guard pinning the CSS gate so a future edit can't silently bring the
// markers back in continuous mode.

const ROOT = join(__dirname, '..', '..')
const globalsCss = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

describe('#5 — continuous mode hides auto page-break markers', () => {
  const css = normalize(globalsCss)

  it('gates the page-boundary overlay off in continuous mode', () => {
    // A rule that targets [data-page-layout="continuous"] and hides the boundary
    // overlay (display:none). We accept either ordering of selector + property.
    expect(css).toContain('[data-page-layout="continuous"] .parchment-page-boundary')
  })

  it('gates the legacy .parchment-page-break line off in continuous mode', () => {
    expect(css).toContain('[data-page-layout="continuous"] .parchment-page-break')
  })

  it('the continuous gate sets display:none', () => {
    // Find the continuous gate block and assert it hides the markers.
    const idx = globalsCss.indexOf('[data-page-layout="continuous"] .parchment-page-boundary')
    expect(idx).toBeGreaterThanOrEqual(0)
    const open = globalsCss.indexOf('{', idx)
    const close = globalsCss.indexOf('}', open)
    const body = normalize(globalsCss.slice(open + 1, close))
    expect(body).toContain('display: none')
  })
})
