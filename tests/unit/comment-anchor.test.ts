// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { resolveAnchor, serializeAnchor } from '@/lib/docs/comment-anchor'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'
import { makePeer, type Peer } from './collab-harness'

// H Task 3 — durable RelativePosition anchoring. The bar #3 test (anchor survives
// a concurrent remote insert before it) uses the Task 13 harness.

const editors: Editor[] = []
const peers: Peer[] = []

afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
  while (peers.length) peers.pop()?.destroy()
})

function makeCollabEditor(content: string): { editor: Editor; ydoc: Y.Doc } {
  const ydoc = new Y.Doc()
  // Mount to a DOM node so the y-prosemirror binding initializes (see harness).
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: [...baseExtensions, Collaboration.configure({ document: ydoc, field: 'default' })],
  })
  editor.commands.setContent(content, { emitUpdate: false })
  editors.push(editor)
  return { editor, ydoc }
}

/** Find the [from,to) range of `needle` in the editor's text (PM positions). */
function rangeOf(editor: Editor, needle: string): { from: number; to: number } {
  let found: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found) return false
    if (node.isText && typeof node.text === 'string') {
      const idx = node.text.indexOf(needle)
      if (idx >= 0) found = { from: pos + idx, to: pos + idx + needle.length }
    }
    return true
  })
  if (!found) throw new Error(`needle ${needle} not found`)
  return found
}

function textInRange(editor: Editor, from: number, to: number): string {
  return editor.state.doc.textBetween(from, to)
}

describe('comment-anchor serialize/resolve', () => {
  it('round-trips an anchor for a word back to the same range', () => {
    const { editor } = makeCollabEditor('<p>hello world</p>')
    const { from, to } = rangeOf(editor, 'world')
    const anchor = serializeAnchor(editor, from, to)
    expect(anchor).not.toBeNull()
    if (!anchor) return
    const resolved = resolveAnchor(editor, anchor)
    expect(resolved).toEqual({ from, to })
    expect(textInRange(editor, resolved!.from, resolved!.to)).toBe('world')
  })

  it('returns null for a non-collab editor (no y-prosemirror binding)', () => {
    const editor = new Editor({ extensions: baseExtensions, content: '<p>hello world</p>' })
    editors.push(editor)
    expect(serializeAnchor(editor, 7, 12)).toBeNull()
  })

  it('SURVIVES a concurrent remote insert before the anchor (bar #3)', () => {
    const peer1 = makePeer('<p>hello world</p>')
    const peer2 = makePeer()
    peers.push(peer1, peer2)
    peer1.syncTo(peer2)

    const { from, to } = rangeOf(peer1.editor, 'world')
    const anchor = serializeAnchor(peer1.editor, from, to)
    expect(anchor).not.toBeNull()
    if (!anchor) return

    // peer2 inserts "BIG " at the very start of the paragraph text (pos 1).
    peer2.editor.commands.insertContentAt(1, 'BIG ')
    peer2.syncTo(peer1)
    expect(peer1.editor.state.doc.textContent).toBe('BIG hello world')

    // The SAME stored anchor still resolves onto "world" (its absolute from shifted +4).
    const resolved = resolveAnchor(peer1.editor, anchor)
    expect(resolved).not.toBeNull()
    expect(textInRange(peer1.editor, resolved!.from, resolved!.to)).toBe('world')
    expect(resolved!.from).toBe(from + 4)
  })

  it('closed start boundary: a prefix insert exactly at `from` is NOT absorbed', () => {
    // The load-bearing closed-interval guarantee (see comment-anchor.ts header):
    // a char typed EXACTLY at the comment-start boundary lands OUTSIDE the anchor,
    // so the comment never silently absorbs a prefix. (y-prosemirror's built-in
    // assoc gives this for the start boundary.)
    const peer1 = makePeer('<p>hello world</p>')
    const peer2 = makePeer()
    peers.push(peer1, peer2)
    peer1.syncTo(peer2)

    const { from, to } = rangeOf(peer1.editor, 'world')
    const anchor = serializeAnchor(peer1.editor, from, to)!
    expect(anchor).not.toBeNull()

    // Insert one char EXACTLY at the comment-start boundary.
    peer2.editor.commands.insertContentAt(from, 'X')
    peer2.syncTo(peer1)

    const resolved = resolveAnchor(peer1.editor, anchor)!
    expect(resolved).not.toBeNull()
    // The inserted "X" is NOT inside the anchor — it still starts at "world".
    expect(textInRange(peer1.editor, resolved.from, resolved.from + 5)).toBe('world')
    expect(peer1.editor.state.doc.textBetween(resolved.from, resolved.from + 1)).toBe('w')
  })

  it('resolves to null when the anchored text is deleted', () => {
    const peer1 = makePeer('<p>hello world</p>')
    const peer2 = makePeer()
    peers.push(peer1, peer2)
    peer1.syncTo(peer2)

    const { from, to } = rangeOf(peer1.editor, 'world')
    const anchor = serializeAnchor(peer1.editor, from, to)!
    expect(anchor).not.toBeNull()

    // Delete "world" (and the preceding space) on peer2, merge back.
    const { from: wFrom, to: wTo } = rangeOf(peer2.editor, 'world')
    peer2.editor.commands.deleteRange({ from: wFrom, to: wTo })
    peer2.syncTo(peer1)
    expect(peer1.editor.state.doc.textContent).toBe('hello ')

    expect(resolveAnchor(peer1.editor, anchor)).toBeNull()
  })

  it('survives a structural edit (new paragraph inserted above)', () => {
    const peer1 = makePeer('<p>hello world</p>')
    const peer2 = makePeer()
    peers.push(peer1, peer2)
    peer1.syncTo(peer2)

    const { from, to } = rangeOf(peer1.editor, 'world')
    const anchor = serializeAnchor(peer1.editor, from, to)!
    expect(anchor).not.toBeNull()

    // peer2 prepends a whole new paragraph at the very top (pos 0).
    peer2.editor.commands.insertContentAt(0, '<p>NEW PARA</p>')
    peer2.syncTo(peer1)
    expect(peer1.editor.state.doc.textContent).toContain('NEW PARA')

    const resolved = resolveAnchor(peer1.editor, anchor)!
    expect(resolved).not.toBeNull()
    expect(textInRange(peer1.editor, resolved.from, resolved.to)).toBe('world')
  })
})
