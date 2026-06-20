// @vitest-environment node
//
// F2b: the core transform behind the disk-reverse-sync → collab Y.Doc bridge,
// exercised WITHOUT Hocuspocus. The collab server (collab/server.ts) builds the
// ProseMirror schema from baseExtensions and calls
// `updateYFragment(ydoc, ydoc.getXmlFragment('default'), schema.nodeFromJSON(json), meta)`
// inside a direct-connection transact. This test runs that exact line against a
// bare Y.Doc to prove the CRITICAL property: applying new content to a fragment
// that already has content REPLACES it (minimal diff in place) — it does NOT
// append or duplicate. That is what makes an external .md edit reach an open
// editor cleanly instead of doubling the document.
//
// Editor-graph note: this test (like the collab process) DOES import the Tiptap
// extension graph via baseExtensions. That is fine under vitest's node runtime
// and tsx — it is ONLY the Next turbopack server bundle that can't load it, which
// is why reverse-sync.ts / watcher.ts / parse.ts stay graph-free and the bridge
// lives in the collab process.

import { getSchema } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from 'y-prosemirror'
import * as Y from 'yjs'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

const FIELD = 'default'

type PMNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
}

const schema = getSchema(baseExtensions)

/** y-prosemirror's BindingMetadata (createEmptyMeta()) — a fresh, empty meta. */
function emptyMeta() {
  return { mapping: new Map(), isOMark: new Map() }
}

/** Apply ProseMirror JSON to the doc's 'default' fragment — the bridge's core op. */
function apply(ydoc: Y.Doc, json: Record<string, unknown>): void {
  const fragment = ydoc.getXmlFragment(FIELD)
  const pmNode = schema.nodeFromJSON(json)
  updateYFragment(ydoc, fragment, pmNode, emptyMeta())
}

/** Read the 'default' fragment back as ProseMirror-shaped JSON. */
function readBack(ydoc: Y.Doc): PMNode {
  return yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(FIELD)) as PMNode
}

/** Depth-first: first node matching the predicate. */
function find(node: PMNode | undefined, pred: (n: PMNode) => boolean): PMNode | undefined {
  if (!node) return undefined
  if (pred(node)) return node
  for (const child of node.content ?? []) {
    const hit = find(child, pred)
    if (hit) return hit
  }
  return undefined
}

/** Collect the text of every text node, top-to-bottom. */
function allText(node: PMNode | undefined): string {
  if (!node) return ''
  let out = node.text ?? ''
  for (const child of node.content ?? []) out += allText(child)
  return out
}

const docA: Record<string, unknown> = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Alpha' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'first body' }] },
  ],
}

const docB: Record<string, unknown> = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Beta' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'second body' }] },
  ],
}

describe('Y.Doc apply bridge (updateYFragment)', () => {
  it('applies content to an empty fragment (heading + paragraph)', () => {
    const ydoc = new Y.Doc()
    apply(ydoc, docA)

    const root = readBack(ydoc)
    const heading = find(root, (n) => n.type === 'heading')
    expect(heading?.attrs?.level).toBe(1)
    expect(allText(heading)).toBe('Alpha')

    const para = find(root, (n) => n.type === 'paragraph')
    expect(allText(para)).toBe('first body')
  })

  it('REPLACES existing content when a different doc is applied to the same fragment', () => {
    const ydoc = new Y.Doc()
    apply(ydoc, docA)
    apply(ydoc, docB) // external edit lands on the SAME fragment

    const root = readBack(ydoc)

    // Replaced, not appended: exactly one heading + one paragraph remain.
    const headings = (root.content ?? []).filter((n) => n.type === 'heading')
    const paragraphs = (root.content ?? []).filter((n) => n.type === 'paragraph')
    expect(headings.length).toBe(1)
    expect(paragraphs.length).toBe(1)

    // The surviving content is docB's, and docA's text is GONE (no merge/dupe).
    expect(headings[0]?.attrs?.level).toBe(2)
    const text = allText(root)
    expect(text).toContain('Beta')
    expect(text).toContain('second body')
    expect(text).not.toContain('Alpha')
    expect(text).not.toContain('first body')
  })
})
