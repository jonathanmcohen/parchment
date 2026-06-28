// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { resolveAnchor, serializeAnchor } from '@/lib/docs/comment-anchor'
import { makePeer, type Peer } from './collab-harness'

// H Task 10 — the CommentsSidebar re-anchor sequence end-to-end: seed a comment with
// a durable JSON anchor, edit text BEFORE the anchor, then run the SAME
// resolveAnchor → re-apply CommentMark sequence the sidebar runs on editor 'update',
// and assert the re-resolved highlight still wraps the ORIGINAL target text. This
// reuses the Task 3 machinery exactly as the component consumes it.

const peers: Peer[] = []
afterEach(() => {
  while (peers.length) peers.pop()?.destroy()
})

/** The sidebar's reanchor(): clear comment marks, re-apply from anchors. */
function reanchor(
  peer: Peer,
  rows: Array<{
    threadId: string
    id: string
    anchorStart: Record<string, unknown>
    anchorEnd: Record<string, unknown>
  }>,
): Set<string> {
  const editor = peer.editor
  const cmType = editor.schema.marks.comment
  if (!cmType) return new Set()
  const orphans = new Set<string>()
  const tr = editor.state.tr
  tr.removeMark(0, editor.state.doc.content.size, cmType)
  for (const c of rows) {
    if (c.threadId !== c.id) continue
    const range = resolveAnchor(editor, { start: c.anchorStart, end: c.anchorEnd })
    if (range === null) {
      orphans.add(c.threadId)
      continue
    }
    if (range.from >= range.to) continue
    tr.addMark(range.from, range.to, cmType.create({ threadId: c.threadId }))
  }
  tr.setMeta('addToHistory', false)
  if (tr.steps.length > 0) editor.view.dispatch(tr)
  return orphans
}

/** Read the threadId-marked text in the doc. */
function markedText(peer: Peer): { threadId: string; text: string } | null {
  let out: { threadId: string; text: string } | null = null
  peer.editor.state.doc.descendants((node) => {
    if (node.isText) {
      const m = node.marks.find((mk) => mk.type.name === 'comment')
      if (m) out = { threadId: m.attrs.threadId as string, text: node.text ?? '' }
    }
    return true
  })
  return out
}

function rangeOf(peer: Peer, needle: string): { from: number; to: number } {
  let found: { from: number; to: number } | null = null
  peer.editor.state.doc.descendants((node, pos) => {
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

describe('CommentsSidebar re-anchor end-to-end (Task 10)', () => {
  it('re-applies the CommentMark on the original target after an edit before it', () => {
    // Sync against a sibling peer first — this reliably builds the y-prosemirror
    // binding (the same path every passing collab test uses), avoiding a headless
    // lone-editor view-realization race.
    const peer = makePeer('<p>hello world</p>')
    const sibling = makePeer()
    peers.push(peer, sibling)
    peer.syncTo(sibling)
    const { from, to } = rangeOf(peer, 'world')
    const anchor = serializeAnchor(peer.editor, from, to)
    expect(anchor).not.toBeNull()
    if (!anchor) return

    const row = { threadId: 't1', id: 't1', anchorStart: anchor.start, anchorEnd: anchor.end }

    // Initial anchoring → mark wraps "world".
    reanchor(peer, [row])
    expect(markedText(peer)).toEqual({ threadId: 't1', text: 'world' })

    // Edit BEFORE the anchor (type "BIG " at the paragraph start).
    peer.editor.commands.insertContentAt(1, 'BIG ')
    expect(peer.editor.state.doc.textContent).toBe('BIG hello world')

    // Re-run the sidebar's reanchor (what the 'update' handler does).
    const orphans = reanchor(peer, [row])
    expect(orphans.size).toBe(0)
    // The highlight STILL wraps exactly "world" (not "worl"/"d worl").
    expect(markedText(peer)).toEqual({ threadId: 't1', text: 'world' })
  })

  it('flags a thread orphaned when its anchored text is deleted', () => {
    const peer = makePeer('<p>hello world</p>')
    const peer2 = makePeer()
    peers.push(peer, peer2)
    peer.syncTo(peer2)

    const { from, to } = rangeOf(peer, 'world')
    const anchor = serializeAnchor(peer.editor, from, to)
    if (!anchor) return
    const row = { threadId: 't1', id: 't1', anchorStart: anchor.start, anchorEnd: anchor.end }
    reanchor(peer, [row])

    // Delete "world" on peer2 and merge back.
    const r = rangeOf(peer2, 'world')
    peer2.editor.commands.deleteRange({ from: r.from, to: r.to })
    peer2.syncTo(peer)

    const orphans = reanchor(peer, [row])
    expect(orphans.has('t1')).toBe(true)
    // No comment mark remains (it didn't get re-applied for the orphaned thread).
    expect(markedText(peer)).toBeNull()
  })
})
