// @vitest-environment node
//
// G4: math serialize/parse round-trip. serialize.ts / parse.ts handle the LaTeX
// *string* only — they import NO katex and NO editor graph (server-runtime
// safe). This suite asserts:
//   - mathInline serializes to $latex$ and parses back to a mathInline node;
//   - mathBlock serializes to a $$…$$ block and parses back to a mathBlock node;
//   - the LaTeX source is preserved verbatim across the round-trip;
//   - a stray price like $5.00 is NOT turned into math (conservative parse).
// Runs in the node env with zero editor/katex deps.

import { describe, expect, it } from 'vitest'
import { markdownToJson } from '@/lib/markdown/parse'
import { serializeMarkdown } from '@/lib/markdown/serialize'

type Node = {
  type?: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
}

const doc = (...content: unknown[]) => ({ type: 'doc', content })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const text = (t: string) => ({ type: 'text', text: t })

function find(node: Node | undefined, pred: (n: Node) => boolean): Node | undefined {
  if (!node) return undefined
  if (pred(node)) return node
  for (const child of node.content ?? []) {
    const hit = find(child, pred)
    if (hit) return hit
  }
  return undefined
}

describe('G4 — math serialize/parse round-trip', () => {
  it('mathInline serializes to $latex$ and round-trips with the LaTeX preserved', () => {
    const original = doc(
      p(text('Let '), { type: 'mathInline', attrs: { latex: 'x_1 + y^2' } }, text(' hold.')),
    )
    const md = serializeMarkdown(original)
    expect(md).toContain('$x_1 + y^2$')

    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'mathInline')
    expect(node).toBeDefined()
    expect(node?.attrs?.latex).toBe('x_1 + y^2')
  })

  it('mathBlock serializes to a $$…$$ block and round-trips with the LaTeX preserved', () => {
    const original = doc({ type: 'mathBlock', attrs: { latex: '\\frac{a}{b} = c' } })
    const md = serializeMarkdown(original)
    expect(md).toContain('$$')
    expect(md).toContain('\\frac{a}{b} = c')

    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'mathBlock')
    expect(node).toBeDefined()
    expect(node?.attrs?.latex).toBe('\\frac{a}{b} = c')
  })

  it('a mixed doc (inline + display math) round-trips, both nodes reconstructed', () => {
    const original = doc(
      p(text('Energy '), { type: 'mathInline', attrs: { latex: 'E=mc^2' } }, text(' famously.')),
      { type: 'mathBlock', attrs: { latex: '\\int_0^1 x\\,dx' } },
    )
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node
    expect(find(back, (n) => n.type === 'mathInline')?.attrs?.latex).toBe('E=mc^2')
    expect(find(back, (n) => n.type === 'mathBlock')?.attrs?.latex).toBe('\\int_0^1 x\\,dx')
  })

  it('a stray price $5.00 does NOT become math (conservative parse)', () => {
    const md = 'The item costs $5.00 today.\n'
    const back = markdownToJson(md) as Node
    expect(find(back, (n) => n.type === 'mathInline')).toBeUndefined()
    // The literal text including the dollar sign survives as plain text.
    const para = find(back, (n) => n.type === 'paragraph')
    const joined = (para?.content ?? []).map((c) => c.text ?? '').join('')
    expect(joined).toContain('$5.00')
  })

  it('two prices on one line ($5.00 and $3.00) do NOT become a single math span', () => {
    const md = 'Prices were $5.00 and $3.00 yesterday.\n'
    const back = markdownToJson(md) as Node
    expect(find(back, (n) => n.type === 'mathInline')).toBeUndefined()
  })

  it('equationRef serializes to plain (N) text and does NOT throw on parse', () => {
    const original = doc(
      p(text('See '), { type: 'equationRef', attrs: { targetIndex: 2 } }, text('.')),
    )
    const md = serializeMarkdown(original)
    expect(md).toContain('(2)')
    // Documented v0.1 choice: (N) is lossy — it parses back as plain text, not
    // an equationRef node. The important guarantee is parse never throws.
    expect(() => markdownToJson(md)).not.toThrow()
    const back = markdownToJson(md) as Node
    expect(find(back, (n) => n.type === 'equationRef')).toBeUndefined()
  })

  it('parse never throws on an unbalanced lone $ (degrades to text)', () => {
    expect(() => markdownToJson('A lone $ dollar sign here.\n')).not.toThrow()
    const back = markdownToJson('A lone $ dollar sign here.\n') as Node
    expect(find(back, (n) => n.type === 'mathInline')).toBeUndefined()
  })
})
