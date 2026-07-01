import { describe, expect, it } from 'vitest'
import { EXPORT_STYLESHEET } from '@/lib/export/html'
import { PRINT_TYPOGRAPHY_CSS, printOverlayFontVars } from '@/lib/export/print-typography'

// v0.2.7 #5: the print path must use the EDITOR's prose typography (var(--font-body)
// / 11pt / 1.15), not EXPORT_STYLESHEET's serif/1.05rem/1.7, so printed line breaks
// and page breaks line up with the editor. EXPORT_STYLESHEET stays untouched (it is
// shared with HTML/EPUB export).

describe('PRINT_TYPOGRAPHY_CSS', () => {
  it('is scoped to the print overlay (never leaks to HTML/EPUB export)', () => {
    // Every selector mentions the print overlay scope.
    const selectors = PRINT_TYPOGRAPHY_CSS.split('{').slice(0, -1)
    for (const sel of selectors) {
      // skip the comment-only chunk at the head
      const last = sel.split('}').pop() ?? ''
      if (!last.includes('parchment-')) continue
      expect(last).toContain('.parchment-print-overlay')
    }
  })

  it('imposes the editor prose font/size/leading on the printed content', () => {
    expect(PRINT_TYPOGRAPHY_CSS).toContain('.parchment-print-overlay .parchment-prose')
    expect(PRINT_TYPOGRAPHY_CSS).toContain('var(--font-body')
    expect(PRINT_TYPOGRAPHY_CSS).toContain('font-size: 11pt')
    expect(PRINT_TYPOGRAPHY_CSS).toContain('line-height: 1.15')
  })

  it('does NOT modify EXPORT_STYLESHEET (HTML/EPUB export unchanged)', () => {
    // The shared export stylesheet still carries its serif body — proof we scoped
    // the print fix rather than editing the shared sheet.
    expect(EXPORT_STYLESHEET).toContain("font-family: Georgia, 'Times New Roman', serif")
    expect(EXPORT_STYLESHEET).not.toContain('parchment-print-overlay')
  })
})

describe('printOverlayFontVars', () => {
  it('propagates resolved font vars into the overlay', () => {
    const v = printOverlayFontVars({
      fontBody: 'Arial, sans-serif',
      fontHeading: 'Roboto, sans-serif',
    })
    expect(v['--font-body']).toBe('Arial, sans-serif')
    expect(v['--font-heading']).toBe('Roboto, sans-serif')
  })

  it('drops blank/missing values so tokens.css :root defaults apply', () => {
    expect(printOverlayFontVars({})).toEqual({})
    expect(printOverlayFontVars({ fontBody: '   ' })).toEqual({})
    expect(printOverlayFontVars({ fontBody: 'Georgia, serif' })).toEqual({
      '--font-body': 'Georgia, serif',
    })
  })
})
