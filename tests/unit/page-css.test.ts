import { describe, expect, it } from 'vitest'
import type { PageSetup } from '@/lib/editor/paginate'
import { DEFAULT_PAGE_SETUP } from '@/lib/editor/paginate'
import { pageCss } from '@/lib/export/page-css'

const base: PageSetup = { ...DEFAULT_PAGE_SETUP }

describe('pageCss', () => {
  it('Letter portrait → 8.5in 11in size', () => {
    const css = pageCss({ ...base, size: 'Letter', orientation: 'portrait' })
    expect(css).toContain('size: 8.5in 11in')
  })

  it('A4 portrait → mm dimensions', () => {
    const css = pageCss({ ...base, size: 'A4', orientation: 'portrait' })
    expect(css).toContain('size: 210mm 297mm')
  })

  it('landscape swaps width and height', () => {
    const css = pageCss({ ...base, size: 'Letter', orientation: 'landscape' })
    expect(css).toContain('size: 11in 8.5in')
  })

  it('A4 landscape swaps dimensions', () => {
    const css = pageCss({ ...base, size: 'A4', orientation: 'landscape' })
    expect(css).toContain('size: 297mm 210mm')
  })

  it('margins are reflected in output (1in = 96px)', () => {
    const css = pageCss({ ...base, margins: { top: 96, right: 96, bottom: 96, left: 96 } })
    expect(css).toContain('margin: 1in 1in 1in 1in')
  })

  it('custom margins reflected correctly', () => {
    // 48px = 0.5in, 72px = 0.75in
    const css = pageCss({
      ...base,
      margins: { top: 48, right: 96, bottom: 48, left: 72 },
    })
    expect(css).toContain('margin: 0.5in 1in 0.5in 0.75in')
  })

  it('malformed/null-like setup returns a sensible default and never throws', () => {
    // biome-ignore lint/suspicious/noExplicitAny: intentional invalid input for test
    expect(() => pageCss(null as any)).not.toThrow()
    // biome-ignore lint/suspicious/noExplicitAny: intentional invalid input for test
    const css = pageCss(null as any)
    expect(css).toContain('@page')
    expect(css).toContain('8.5in 11in')
  })

  it('unknown size name falls back to default rule', () => {
    // biome-ignore lint/suspicious/noExplicitAny: intentional invalid input for test
    const css = pageCss({ ...base, size: 'A3' as any })
    expect(css).toContain('@page')
    expect(css).toContain('8.5in 11in')
  })

  it('Legal portrait → 8.5in 14in', () => {
    const css = pageCss({ ...base, size: 'Legal', orientation: 'portrait' })
    expect(css).toContain('size: 8.5in 14in')
  })

  it('Custom size portrait → px → in conversion', () => {
    // 816px wide × 1056px tall = 8.5in × 11in at 96dpi
    const css = pageCss({
      ...base,
      size: 'Custom',
      orientation: 'portrait',
      widthPx: 816,
      heightPx: 1056,
    })
    expect(css).toContain('size: 8.5in 11in')
  })

  it('Custom size landscape swaps px dimensions', () => {
    const css = pageCss({
      ...base,
      size: 'Custom',
      orientation: 'landscape',
      widthPx: 816,
      heightPx: 1056,
    })
    expect(css).toContain('size: 11in 8.5in')
  })

  // S4-4: the default @page rule is 1in margins; the A4 preset (96px margins)
  // resolves to the same 1in — and 1in ≡ 2.54cm, so the on-screen --page-pad (96px)
  // and the printed @page margin agree across Letter and A4.
  it('default rule (no margins) → margin: 1in 1in 1in 1in', () => {
    // biome-ignore lint/suspicious/noExplicitAny: exercising the no-setup default path
    expect(pageCss(null as any)).toContain('margin: 1in 1in 1in 1in')
  })

  it('A4 preset with 96px (1in) margins → 1in, which equals 2.54cm', () => {
    const css = pageCss({
      ...base,
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 96, right: 96, bottom: 96, left: 96 },
    })
    expect(css).toContain('size: 210mm 297mm')
    expect(css).toContain('margin: 1in 1in 1in 1in')
    // 96px @ 96dpi = 1in; 1in * 2.54 = 2.54cm — the screen/print margins coincide.
    expect((96 / 96) * 2.54).toBeCloseTo(2.54, 10)
  })

  // v0.1.10 #13: marginless mode keeps the page SIZE but emits `margin: 0` so the
  // real-sheet print path can supply the margin via each sheet's own padding
  // (otherwise the @page margin + sheet padding would double up).
  it('marginless option emits margin: 0 with the size preserved', () => {
    const css = pageCss({ ...base, size: 'Letter', orientation: 'portrait' }, { marginless: true })
    expect(css).toContain('size: 8.5in 11in')
    expect(css).toContain('margin: 0')
    expect(css).not.toContain('margin: 1in')
  })

  it('marginless honours landscape + custom size', () => {
    const css = pageCss(
      { ...base, size: 'Custom', orientation: 'landscape', widthPx: 816, heightPx: 1056 },
      { marginless: true },
    )
    expect(css).toContain('size: 11in 8.5in')
    expect(css).toContain('margin: 0')
  })
})
