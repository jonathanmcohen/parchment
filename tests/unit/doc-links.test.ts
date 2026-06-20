// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { extractTargetIds } from '@/lib/docs/doc-links'
import { markdownToJson } from '@/lib/markdown/parse'
import { serializeMarkdown } from '@/lib/markdown/serialize'

// F6: pure-side coverage — wikiLink targetId extraction + [[Label]] markdown
// round-trip. Runs in the node env with NO editor graph (mirrors serialize.ts /
// parse.ts server-runtime constraint).

type Node = {
  type?: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
}

const doc = (...content: unknown[]) => ({ type: 'doc', content })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const text = (t: string) => ({ type: 'text', text: t })
const wiki = (targetId: string, label: string) => ({ type: 'wikiLink', attrs: { targetId, label } })

/** Depth-first find of the first node matching the predicate. */
function find(node: Node | undefined, pred: (n: Node) => boolean): Node | undefined {
  if (!node) return undefined
  if (pred(node)) return node
  for (const child of node.content ?? []) {
    const hit = find(child, pred)
    if (hit) return hit
  }
  return undefined
}

/** Collect ALL nodes matching the predicate (document order). */
function findAll(node: Node | undefined, pred: (n: Node) => boolean): Node[] {
  const out: Node[] = []
  const walk = (n: Node | undefined) => {
    if (!n) return
    if (pred(n)) out.push(n)
    for (const child of n.content ?? []) walk(child)
  }
  walk(node)
  return out
}

describe('F6 — extractTargetIds', () => {
  it('finds a top-level wikiLink targetId', () => {
    const document = doc(p(text('see '), wiki('id-1', 'Doc One')))
    expect(extractTargetIds(document)).toEqual(['id-1'])
  })

  it('finds nested wikiLink targetIds (inside list items, blockquotes)', () => {
    const document = doc(
      p(wiki('a', 'A')),
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [p(text('x '), wiki('b', 'B'))] },
          { type: 'listItem', content: [p(wiki('c', 'C'))] },
        ],
      },
      { type: 'blockquote', content: [p(wiki('d', 'D'))] },
    )
    expect(extractTargetIds(document)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('dedupes repeated targetIds, preserving first-seen order', () => {
    const document = doc(p(wiki('x', 'X'), wiki('y', 'Y'), wiki('x', 'X again')))
    expect(extractTargetIds(document)).toEqual(['x', 'y'])
  })

  it('ignores empty/unresolved targetIds', () => {
    const document = doc(p(wiki('', 'Unresolved'), wiki('real', 'Real')))
    expect(extractTargetIds(document)).toEqual(['real'])
  })

  it('never throws on malformed input', () => {
    expect(extractTargetIds(null)).toEqual([])
    expect(extractTargetIds(undefined)).toEqual([])
    expect(extractTargetIds('not a node')).toEqual([])
    expect(extractTargetIds({ type: 'wikiLink' })).toEqual([]) // no attrs
    expect(extractTargetIds({ content: 'not-an-array' })).toEqual([])
  })
})

describe('F6 — [[Label]] markdown round-trip', () => {
  it('serializes a wikiLink node to [[Label]]', () => {
    const md = serializeMarkdown(doc(p(text('go to '), wiki('id-9', 'My Page'))))
    expect(md).toContain('[[My Page]]')
    // The targetId is NOT in the markdown (resolved by title on parse).
    expect(md).not.toContain('id-9')
  })

  it('parses [[Label]] from markdown into a wikiLink node (unresolved targetId GAP)', () => {
    const back = markdownToJson('See [[Some Doc]] now.') as Node
    const node = find(back, (n) => n.type === 'wikiLink')
    expect(node).toBeDefined()
    expect(node?.attrs?.label).toBe('Some Doc')
    // Documented GAP: hand-typed/external [[Label]] parses with an empty targetId
    // — markdownToJson is sync and must not hit @/db to resolve the title.
    expect(node?.attrs?.targetId).toBe('')
  })

  it('round-trips the LABEL of an editor-inserted wikiLink (serialize → parse)', () => {
    const original = doc(p(text('intro '), wiki('id-1', 'Linked Title')))
    const md = serializeMarkdown(original)
    expect(md).toContain('[[Linked Title]]')

    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'wikiLink')
    expect(node).toBeDefined()
    expect(node?.attrs?.label).toBe('Linked Title')
  })

  it('handles multiple [[links]] on one line and surrounding text', () => {
    const back = markdownToJson('a [[One]] b [[Two]] c') as Node
    const links = findAll(back, (n) => n.type === 'wikiLink')
    expect(links.map((l) => l.attrs?.label)).toEqual(['One', 'Two'])
    // The surrounding text survives as text nodes.
    const textNodes = findAll(back, (n) => n.type === 'text').map((n) => n.text)
    expect(textNodes.join('')).toContain('a ')
    expect(textNodes.join('')).toContain(' b ')
    expect(textNodes.join('')).toContain(' c')
  })

  it('a bare [[Label]] paragraph parses to a single wikiLink', () => {
    const back = markdownToJson('[[Solo]]') as Node
    const links = findAll(back, (n) => n.type === 'wikiLink')
    expect(links).toHaveLength(1)
    expect(links[0]?.attrs?.label).toBe('Solo')
  })

  it('does not throw on unmatched brackets and leaves them as text', () => {
    expect(() => markdownToJson('a [[ unclosed and ]] stray')).not.toThrow()
    const back = markdownToJson('just [single] brackets') as Node
    expect(find(back, (n) => n.type === 'wikiLink')).toBeUndefined()
  })
})

describe('F6 — wiki-label invariant (no brackets in labels)', () => {
  // A wikiLink label must never contain `[` or `]` so [[Label]] round-trips.
  // serialize.ts strips brackets defensively; the parse recognizer then matches
  // the clean label. Without stripping these labels silently degrade to text.
  const cases: { name: string; label: string; expected: string }[] = [
    { name: 'a single [ in the label', label: 'Doc [1]', expected: 'Doc 1' },
    { name: 'a single trailing ]', label: 'a]b', expected: 'ab' },
    { name: 'an embedded ]] sequence', label: 'a]]b', expected: 'ab' },
    { name: 'an embedded [[ sequence', label: 'a[[b', expected: 'ab' },
    { name: 'a bracketed title', label: 'Notes [draft]', expected: 'Notes draft' },
  ]

  for (const { name, label, expected } of cases) {
    it(`round-trips a label with ${name}`, () => {
      const original = doc(p(text('see '), wiki('id-1', label)))
      const md = serializeMarkdown(original)
      // Canonical markdown carries the sanitized label and nothing breaks it.
      expect(md).toContain(`[[${expected}]]`)

      const back = markdownToJson(md) as Node
      const node = find(back, (n) => n.type === 'wikiLink')
      expect(node).toBeDefined()
      expect(node?.attrs?.label).toBe(expected)
    })
  }

  it('emits an empty label as [[]] which the parser declines to match', () => {
    const md = serializeMarkdown(doc(p(wiki('id-1', ''))))
    expect(md).toContain('[[]]')
    const back = markdownToJson(md) as Node
    // An empty label cannot identify a target, so it stays literal text.
    expect(find(back, (n) => n.type === 'wikiLink')).toBeUndefined()
  })

  it('collapses an all-bracket label to an empty (non-matching) [[]]', () => {
    const md = serializeMarkdown(doc(p(wiki('id-1', '[[]]'))))
    expect(md).toBe('[[]]\n')
    const back = markdownToJson(md) as Node
    expect(find(back, (n) => n.type === 'wikiLink')).toBeUndefined()
  })
})
