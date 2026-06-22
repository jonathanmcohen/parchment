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
})
