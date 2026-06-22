// @vitest-environment node
//
// G8b: cross-reference serialize/parse round-trip. serialize.ts / parse.ts
// handle crossRef nodes as plain `[#refId]` inline syntax — they import NO
// editor graph and NO DOM. This suite asserts:
//   - a crossRef node (format 'full') serializes to `[#targetId]`;
//   - a crossRef node (format 'number') serializes to `[#targetId|number]`;
//   - parseMarkdown reconstructs a crossRef node with targetId preserved;
//   - format round-trips (full and number);
//   - a stray `[#` in prose that doesn't match the conservative regex stays text;
//   - a doc with a figure target + paragraph crossRef: serialize contains
//     `[#f1]` and parse reconstructs the crossRef with targetId 'f1'.
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const crossRefFull = (targetId: string) => ({
  type: 'crossRef',
  attrs: { targetId, kind: 'figure', format: 'full' },
})

const crossRefNumber = (targetId: string) => ({
  type: 'crossRef',
  attrs: { targetId, kind: 'figure', format: 'number' },
})

// A figure node with a refId (as produced by the G8a round-trip).
const figureNode = (refId: string) => ({
  type: 'image',
  attrs: {
    src: 'https://example.com/img.png',
    alt: 'test',
    caption: 'My figure',
    refId,
    position: 'inline',
    width: null,
    height: null,
    lockAspect: true,
  },
})

// ── crossRef serialization ────────────────────────────────────────────────────

describe('G8b — crossRef serialize', () => {
  it('serializes a crossRef node (full format) to [#targetId]', () => {
    const original = doc(p(text('See '), crossRefFull('f1'), text('.')))
    const md = serializeMarkdown(original)
    expect(md).toContain('[#f1]')
  })

  it('serializes a crossRef node (number format) to [#targetId|number]', () => {
    const original = doc(p(text('See '), crossRefNumber('f1'), text('.')))
    const md = serializeMarkdown(original)
    expect(md).toContain('[#f1|number]')
  })

  it('does not emit [#] for a crossRef with no targetId', () => {
    const empty = { type: 'crossRef', attrs: { targetId: '', kind: 'figure', format: 'full' } }
    const original = doc(p(text('See '), empty, text('.')))
    const md = serializeMarkdown(original)
    expect(md).not.toContain('[#]')
  })
})

// ── crossRef parse ────────────────────────────────────────────────────────────

describe('G8b — crossRef parse', () => {
  it('parses [#f1] to a crossRef node with targetId f1', () => {
    const md = 'See [#f1].\n'
    const back = markdownToJson(md) as Node
    const ref = find(back, (n) => n.type === 'crossRef')
    expect(ref).toBeDefined()
    expect(ref?.attrs?.targetId).toBe('f1')
    expect(ref?.attrs?.format).toBe('full')
  })

  it('parses [#f1|number] to a crossRef node with format "number"', () => {
    const md = 'See [#f1|number].\n'
    const back = markdownToJson(md) as Node
    const ref = find(back, (n) => n.type === 'crossRef')
    expect(ref).toBeDefined()
    expect(ref?.attrs?.targetId).toBe('f1')
    expect(ref?.attrs?.format).toBe('number')
  })

  it('a stray `[# in prose` (space after hash) stays plain text', () => {
    const md = 'A stray [# in prose here.\n'
    const back = markdownToJson(md) as Node
    const ref = find(back, (n) => n.type === 'crossRef')
    expect(ref).toBeUndefined()
  })
})

// ── round-trip ────────────────────────────────────────────────────────────────

describe('G8b — crossRef round-trip', () => {
  it('round-trips a crossRef (full format) through serialize → parse', () => {
    const original = doc(p(text('See '), crossRefFull('f1'), text('.')))
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node
    const ref = find(back, (n) => n.type === 'crossRef')
    expect(ref?.attrs?.targetId).toBe('f1')
    expect(ref?.attrs?.format).toBe('full')
  })

  it('round-trips a crossRef (number format) through serialize → parse', () => {
    const original = doc(p(text('Number: '), crossRefNumber('fig-abc'), text('.')))
    const md = serializeMarkdown(original)
    const back = markdownToJson(md) as Node
    const ref = find(back, (n) => n.type === 'crossRef')
    expect(ref?.attrs?.targetId).toBe('fig-abc')
    expect(ref?.attrs?.format).toBe('number')
  })

  it('round-trips a doc with a figure (refId f1) + paragraph crossRef to [#f1]', () => {
    const original = doc(figureNode('f1'), p(text('As shown in '), crossRefFull('f1'), text('.')))
    const md = serializeMarkdown(original)
    // The crossRef serializes to [#f1]
    expect(md).toContain('[#f1]')
    // The figure serializes as a parchment:figure fence with refId
    expect(md).toContain('parchment:figure')
    expect(md).toContain('"refId":"f1"')
    // Parse reconstructs the crossRef with targetId 'f1'
    const back = markdownToJson(md) as Node
    const ref = find(back, (n) => n.type === 'crossRef')
    expect(ref?.attrs?.targetId).toBe('f1')
    // Parse reconstructs the figure with refId 'f1'
    const fig = find(back, (n) => n.type === 'image' && n.attrs?.refId === 'f1')
    expect(fig).toBeDefined()
  })
})
