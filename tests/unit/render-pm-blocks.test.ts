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
