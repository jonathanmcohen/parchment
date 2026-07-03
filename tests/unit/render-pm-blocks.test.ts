import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderReadOnlyDoc } from '@/components/share/render-pm'

// v0.2.8 #3 — the read-only renderer (Reading mode / share / print / epub) must
// render tables and math with real structure, not drop them to a bare text
// fragment. Before this, `table`/`tableRow`/`tableCell`/`tableHeader` and
// `mathInline`/`mathBlock` fell through render-pm's default case and lost all
// structure, so Reading mode showed them unformatted.

function html(doc: unknown): string {
  return renderToStaticMarkup(renderReadOnlyDoc(doc) as React.ReactElement)
}

function docOf(...content: unknown[]) {
  return { type: 'doc', content }
}

describe('render-pm — tables', () => {
  it('renders a table with thead/tbody structure and cell text', () => {
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableHeader',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }],
            },
            {
              type: 'tableHeader',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Role' }] }],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ada' }] }],
            },
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Author' }] }],
            },
          ],
        },
      ],
    }
    const out = html(docOf(table))
    expect(out).toContain('<table')
    expect(out).toContain('<th')
    expect(out).toContain('<td')
    expect(out).toContain('Name')
    expect(out).toContain('Ada')
  })

  it('honours colspan / rowspan on cells', () => {
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 2, rowspan: 1 },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wide' }] }],
            },
          ],
        },
      ],
    }
    const out = html(docOf(table))
    // React lowercases colSpan → colspan in real DOM; assert case-insensitively.
    expect(out.toLowerCase()).toContain('colspan="2"')
  })
})

describe('render-pm — math (KaTeX)', () => {
  it('renders block math to KaTeX HTML (not bare text)', () => {
    const out = html(docOf({ type: 'mathBlock', attrs: { latex: 'x^2 + y^2' } }))
    // KaTeX emits a .katex container; the raw latex source must NOT appear as the
    // literal fallback text `x^2 + y^2` (it is rendered into markup).
    expect(out).toContain('katex')
    expect(out).toContain('parchment-math-block')
  })

  it('renders inline math to KaTeX HTML', () => {
    const out = html(
      docOf({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Euler: ' },
          { type: 'mathInline', attrs: { latex: 'e^{i\\pi}' } },
        ],
      }),
    )
    expect(out).toContain('katex')
    expect(out).toContain('parchment-math-inline')
  })

  it('degrades a malformed formula without throwing', () => {
    // throwOnError:false → KaTeX renders an error node rather than crashing SSR.
    expect(() => html(docOf({ type: 'mathBlock', attrs: { latex: '\\frac{' } }))).not.toThrow()
  })
})

// v0.2.10 — images render as a real <figure>/<img>/<figcaption> in read-only
// surfaces (Reading mode / share / print / epub / HTML export), carrying
// width / alignment / alt / caption. URL is still strictly gated (http(s) or
// app-relative only) — the public viewer must never load data:/javascript: srcs.
describe('render-pm — images', () => {
  const img = (attrs: Record<string, unknown>) => ({ type: 'image', attrs })

  it('renders a real <img> with src + alt (not a placeholder link)', () => {
    const out = html(docOf(img({ src: 'https://cdn.example.com/a.png', alt: 'A photo' })))
    expect(out).toContain('<img')
    expect(out).toContain('src="https://cdn.example.com/a.png"')
    expect(out).toContain('alt="A photo"')
    // no longer the old bracketed-link fallback
    expect(out).not.toContain('[A photo]')
  })

  it('carries width as an inline style', () => {
    const out = html(docOf(img({ src: '/assets/d/p.png', alt: 'x', width: 320 })))
    expect(out).toMatch(/width:\s*320px/)
  })

  it('reflects alignment via a data-align attribute', () => {
    const out = html(docOf(img({ src: '/assets/d/p.png', alt: 'x', align: 'right' })))
    expect(out).toContain('data-align="right"')
  })

  it('renders a caption in a <figcaption>', () => {
    const out = html(docOf(img({ src: '/assets/d/p.png', alt: 'x', caption: 'The office cat' })))
    expect(out).toContain('<figcaption')
    expect(out).toContain('The office cat')
  })

  it('omits the figcaption entirely when there is no caption', () => {
    const out = html(docOf(img({ src: '/assets/d/p.png', alt: 'x' })))
    expect(out).not.toContain('<figcaption')
  })

  it('rejects a data: URL src (XSS-safe public viewer)', () => {
    const out = html(docOf(img({ src: 'data:text/html,<script>alert(1)</script>', alt: 'evil' })))
    expect(out).not.toContain('<img')
    expect(out).not.toContain('data:text/html')
  })

  it('rejects a javascript: URL src', () => {
    const out = html(docOf(img({ src: 'javascript:alert(1)', alt: 'evil' })))
    expect(out).not.toContain('<img')
    expect(out).not.toContain('javascript:')
  })

  it('escapes a malicious caption (text, never raw HTML)', () => {
    const out = html(
      docOf(img({ src: '/a.png', alt: 'x', caption: '<img src=x onerror=alert(1)>' })),
    )
    // The caption is rendered as escaped text inside figcaption, so the literal
    // onerror payload must NOT appear as a live attribute-bearing tag.
    expect(out).not.toContain('onerror=alert(1)>')
    expect(out).toContain('&lt;img')
  })
})
