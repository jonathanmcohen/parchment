// @vitest-environment node
//
// J1: pure-side coverage for the Cairn cross-link — pageId extraction, the
// `[[cairn://id|label]]` markdown round-trip, the cairn-before-wiki parse
// ordering, the off-by-default config, and pageId sanitization. Runs in the node
// env with NO editor graph (mirrors serialize.ts / parse.ts server-runtime
// constraint and the F6 doc-links.test.ts structure).

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractCairnPageIds } from '@/lib/docs/cairn-links'
import {
  cairnPageUrl,
  isCairnEnabled,
  isValidCairnPageId,
  sanitizeCairnPageId,
} from '@/lib/integrations/cairn'
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
const cairn = (pageId: string, label: string) => ({ type: 'cairnLink', attrs: { pageId, label } })
const wiki = (targetId: string, label: string) => ({ type: 'wikiLink', attrs: { targetId, label } })

function find(node: Node | undefined, pred: (n: Node) => boolean): Node | undefined {
  if (!node) return undefined
  if (pred(node)) return node
  for (const child of node.content ?? []) {
    const hit = find(child, pred)
    if (hit) return hit
  }
  return undefined
}

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

describe('J1 — extractCairnPageIds', () => {
  it('finds cairnLink pageIds and IGNORES wikiLink nodes', () => {
    const document = doc(
      p(text('see '), cairn('page-1', 'Page One'), text(' and '), wiki('doc-x', 'Doc X')),
    )
    // Only the cairn pageId — the wiki targetId must NOT appear.
    expect(extractCairnPageIds(document)).toEqual(['page-1'])
  })

  it('dedupes + drops unsafe/empty pageIds, preserving first-seen order', () => {
    const document = doc(
      p(cairn('a', 'A'), cairn('b', 'B'), cairn('a', 'A again')),
      p(cairn('../etc/passwd', 'evil'), cairn('', 'empty')),
    )
    // 'a','b' kept (deduped); the traversal id and empty id are dropped.
    expect(extractCairnPageIds(document)).toEqual(['a', 'b'])
  })

  it('never throws on malformed input', () => {
    expect(extractCairnPageIds(null)).toEqual([])
    expect(extractCairnPageIds(undefined)).toEqual([])
    expect(extractCairnPageIds('not a node')).toEqual([])
    expect(extractCairnPageIds({ type: 'cairnLink' })).toEqual([]) // no attrs
  })
})

describe('J1 — [[cairn://id|label]] markdown round-trip', () => {
  it('serializes a cairnLink node to [[cairn://id|label]] (pageId preserved)', () => {
    const md = serializeMarkdown(doc(p(text('go to '), cairn('page-9', 'My Cairn Page'))))
    expect(md).toContain('[[cairn://page-9|My Cairn Page]]')
    // UNLIKE wiki, the pageId IS in the markdown.
    expect(md).toContain('page-9')
  })

  it('serializes a label-less cairnLink to the bare [[cairn://id]] form', () => {
    const md = serializeMarkdown(doc(p(cairn('page-7', ''))))
    expect(md).toContain('[[cairn://page-7]]')
    expect(md).not.toContain('|')
  })

  it('parses [[cairn://id|label]] into a cairnLink (pageId + label preserved)', () => {
    const back = markdownToJson('See [[cairn://page-3|Roadmap]] now.') as Node
    const node = find(back, (n) => n.type === 'cairnLink')
    expect(node).toBeDefined()
    expect(node?.attrs?.pageId).toBe('page-3')
    expect(node?.attrs?.label).toBe('Roadmap')
  })

  it('parses a bare [[cairn://id]] into a cairnLink with an empty label', () => {
    const back = markdownToJson('[[cairn://solo-page]]') as Node
    const links = findAll(back, (n) => n.type === 'cairnLink')
    expect(links).toHaveLength(1)
    expect(links[0]?.attrs?.pageId).toBe('solo-page')
    expect(links[0]?.attrs?.label).toBe('')
  })

  it('round-trips an editor-inserted cairnLink (serialize → parse)', () => {
    const original = doc(p(text('intro '), cairn('pg-42', 'Linked Page')))
    const md = serializeMarkdown(original)
    expect(md).toContain('[[cairn://pg-42|Linked Page]]')
    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'cairnLink')
    expect(node?.attrs?.pageId).toBe('pg-42')
    expect(node?.attrs?.label).toBe('Linked Page')
  })
})

describe('J1 — cairn matched BEFORE the wiki rule (no cross-contamination)', () => {
  it('does NOT mis-parse a plain [[Label]] as a cairn link', () => {
    const back = markdownToJson('See [[Plain Wiki]] here.') as Node
    expect(find(back, (n) => n.type === 'cairnLink')).toBeUndefined()
    const wikiNode = find(back, (n) => n.type === 'wikiLink')
    expect(wikiNode?.attrs?.label).toBe('Plain Wiki')
  })

  it('parses a cairn link as cairn (NOT wiki) even alongside a wiki link', () => {
    const back = markdownToJson('a [[cairn://pg-1|C]] b [[Wiki Doc]] c') as Node
    const cairns = findAll(back, (n) => n.type === 'cairnLink')
    const wikis = findAll(back, (n) => n.type === 'wikiLink')
    expect(cairns.map((n) => n.attrs?.pageId)).toEqual(['pg-1'])
    // The cairn link was consumed by the cairn rule and is NOT also a wiki link.
    expect(wikis.map((n) => n.attrs?.label)).toEqual(['Wiki Doc'])
  })

  it('a traversal/injection pageId is rejected — never becomes a cairnLink', () => {
    const back = markdownToJson('x [[cairn://../../etc/passwd]] y') as Node
    // No cairnLink with an unsafe id.
    expect(find(back, (n) => n.type === 'cairnLink')).toBeUndefined()
    // It is NOT silently dropped: the [[…]] run falls through to the wiki path
    // as a literal wiki label, so content is preserved (never an unsafe link).
    const wikiNode = find(back, (n) => n.type === 'wikiLink')
    expect(wikiNode?.attrs?.label).toContain('cairn://')
  })
})

describe('J1 — off-by-default config (E9 pattern) + pageId sanitization', () => {
  const saved = process.env.CAIRN_BASE_URL
  beforeEach(() => {
    process.env.CAIRN_BASE_URL = undefined
    delete process.env.CAIRN_BASE_URL
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.CAIRN_BASE_URL
    else process.env.CAIRN_BASE_URL = saved
  })

  it('isCairnEnabled is false + cairnPageUrl is null when CAIRN_BASE_URL is unset', () => {
    expect(isCairnEnabled()).toBe(false)
    expect(cairnPageUrl('page-1')).toBeNull()
  })

  it('isCairnEnabled is true + cairnPageUrl is a real URL when set', () => {
    process.env.CAIRN_BASE_URL = 'https://cairn.example.com'
    expect(isCairnEnabled()).toBe(true)
    expect(cairnPageUrl('page-1')).toBe('https://cairn.example.com/p/page-1')
  })

  it('cairnPageUrl returns null for an invalid pageId even when configured', () => {
    process.env.CAIRN_BASE_URL = 'https://cairn.example.com'
    expect(cairnPageUrl('../etc/passwd')).toBeNull()
    expect(cairnPageUrl('javascript:alert(1)')).toBeNull()
  })

  it('rejects/sanitizes traversal, scheme-injection, CRLF, and overlong ids', () => {
    expect(isValidCairnPageId('good-id_1.2')).toBe(true)
    expect(isValidCairnPageId('../secret')).toBe(false)
    expect(isValidCairnPageId('a/b')).toBe(false)
    expect(isValidCairnPageId('javascript:alert(1)')).toBe(false)
    expect(isValidCairnPageId('a\r\nb')).toBe(false)
    expect(isValidCairnPageId('..')).toBe(false)
    expect(isValidCairnPageId('a'.repeat(129))).toBe(false)
    // sanitize salvages a value to the safe grammar, or null when unsalvageable.
    expect(sanitizeCairnPageId('My Page!')).toBe('MyPage')
    expect(sanitizeCairnPageId('../../etc')).toBe('etc')
    expect(sanitizeCairnPageId('..')).toBeNull()
    expect(sanitizeCairnPageId('///')).toBeNull()
  })
})
