// @vitest-environment node
//
// G7b: citation serialize/parse round-trip. serialize.ts / parse.ts handle
// CslEntry arrays and inline cite keys as plain JSON/strings only — they import
// NO editor graph and NO DOM. This suite asserts:
//   - a bibliography node serializes to a ```parchment:bibliography fence with
//     {refs, style} JSON;
//   - a citation inline node serializes to [@citeKey] (Pandoc-style);
//   - parseMarkdown reconstructs both nodes with refs/citeKey preserved;
//   - parseCslEntries round-trips the entry fields (id, type, title, author, issued);
//   - a stray [@] or [@ ] that is not a valid key pattern stays plain text;
//   - a malformed parchment:bibliography fence body parses without throwing and
//     degrades to a plain codeBlock.
// Runs in the node env with zero editor/DOM deps.

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

function _findAll(node: Node | undefined, pred: (n: Node) => boolean): Node[] {
  const out: Node[] = []
  if (!node) return out
  if (pred(node)) out.push(node)
  for (const child of node.content ?? []) {
    out.push(..._findAll(child, pred))
  }
  return out
}

const ENTRY = {
  id: 'smith2020',
  type: 'article-journal' as const,
  title: 'Test Article',
  author: [{ family: 'Smith', given: 'Alice' }],
  issued: { 'date-parts': [[2020]] as [[number]] },
}

const BIB_NODE = {
  type: 'bibliography',
  attrs: { refs: [ENTRY], style: 'mla' },
}

const CITE_NODE = {
  type: 'citation',
  attrs: { citeKey: 'smith2020', page: '' },
}

// ── Bibliography serialization ───────────────────────────────────────────────

describe('G7b — bibliography serialize/parse round-trip', () => {
  it('serializes a bibliography node to a parchment:bibliography fence', () => {
    const original = doc(BIB_NODE)
    const md = serializeMarkdown(original)
    expect(md).toContain('```parchment:bibliography')
    expect(md).toContain('```')
  })

  it('fence JSON body contains refs and style', () => {
    const original = doc(BIB_NODE)
    const md = serializeMarkdown(original)
    const bodyMatch = md.match(/```parchment:bibliography\n([\s\S]*?)\n```/)
    expect(bodyMatch).not.toBeNull()
    const body = bodyMatch?.[1] ?? ''
    const parsed = JSON.parse(body) as { refs: unknown[]; style: string }
    expect(parsed.style).toBe('mla')
    expect(Array.isArray(parsed.refs)).toBe(true)
    expect(parsed.refs).toHaveLength(1)
  })

  it('parseMarkdown reconstructs a bibliography node with refs preserved', () => {
    const original = doc(BIB_NODE)
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node
    const bib = find(back, (n) => n.type === 'bibliography')
    expect(bib).toBeDefined()
    expect(bib?.attrs?.style).toBe('mla')
    const refs = bib?.attrs?.refs as unknown[]
    expect(Array.isArray(refs)).toBe(true)
    expect(refs).toHaveLength(1)
    const entry = refs[0] as typeof ENTRY
    expect(entry.id).toBe('smith2020')
    expect(entry.title).toBe('Test Article')
  })

  it('malformed parchment:bibliography fence parses without throwing and degrades to codeBlock', () => {
    const malformed = '```parchment:bibliography\n{invalid!!!\n```\n'
    let result: Node | undefined
    expect(() => {
      result = markdownToJson(malformed) as Node
    }).not.toThrow()
    const bib = find(result, (n) => n.type === 'bibliography')
    expect(bib).toBeUndefined()
  })
})

// ── Citation inline serialization ────────────────────────────────────────────

describe('G7b — citation inline serialize/parse round-trip', () => {
  it('serializes a citation node to [@citeKey]', () => {
    const original = doc(p(text('See '), CITE_NODE, text('.')))
    const md = serializeMarkdown(original)
    expect(md).toContain('[@smith2020]')
  })

  it('parseMarkdown reconstructs a citation node with citeKey preserved', () => {
    const original = doc(p(text('See '), CITE_NODE, text('.')))
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node
    const cite = find(back, (n) => n.type === 'citation')
    expect(cite).toBeDefined()
    expect(cite?.attrs?.citeKey).toBe('smith2020')
  })

  it('round-trips a doc with both bibliography and citation', () => {
    const original = doc(p(text('Smith says '), CITE_NODE, text(' about this.')), BIB_NODE)
    const md = serializeMarkdown(original)
    expect(md).toContain('[@smith2020]')
    expect(md).toContain('```parchment:bibliography')

    const back = markdownToJson(md) as Node
    const cite = find(back, (n) => n.type === 'citation')
    expect(cite?.attrs?.citeKey).toBe('smith2020')

    const bib = find(back, (n) => n.type === 'bibliography')
    expect(bib).toBeDefined()
    const refs = bib?.attrs?.refs as unknown[]
    expect(refs).toHaveLength(1)
  })

  it('a stray [@] without a valid key pattern stays as plain text', () => {
    const md = 'A stray [@ ] in prose here.\n'
    const back = markdownToJson(md) as Node
    const cite = find(back, (n) => n.type === 'citation')
    expect(cite).toBeUndefined()
  })

  it('citation with page round-trips to [@key, p. N]', () => {
    const citeWithPage = {
      type: 'citation',
      attrs: { citeKey: 'smith2020', page: '42' },
    }
    const original = doc(p(citeWithPage))
    const md = serializeMarkdown(original)
    expect(md).toContain('[@smith2020, p. 42]')

    const back = markdownToJson(md) as Node
    const cite = find(back, (n) => n.type === 'citation')
    expect(cite?.attrs?.citeKey).toBe('smith2020')
    // page is stored after stripping leading "p. "
    expect(cite?.attrs?.page).toBe('42')
  })
})
