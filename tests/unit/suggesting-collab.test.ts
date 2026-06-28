// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { makePeer, type Peer } from './collab-harness'

// H Task 6 — suggestion marks ride Yjs natively (they are plain ProseMirror marks
// in the doc content). This proves accept/reject under two-client concurrency
// converges with NO suggestion-specific awareness or locking.

const peers: Peer[] = []
function track(p: Peer): Peer {
  peers.push(p)
  return p
}
afterEach(() => {
  while (peers.length) peers.pop()?.destroy()
})

function json(p: Peer) {
  return JSON.stringify(p.editor.getJSON())
}
function text(p: Peer) {
  return p.editor.state.doc.textContent
}
function hasInsertionMark(p: Peer): boolean {
  let found = false
  p.editor.state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === 'insertion')) found = true
    return true
  })
  return found
}

/**
 * Insert `t` at PM position `at` as an insertion-marked run — the exact content
 * suggesting PRODUCES. We do NOT enable the suggesting plugin here: its
 * appendTransaction would re-wrap text around the cursor and double-mark. This task
 * proves the MARKS sync through Yjs and accept/reject converges — the marking
 * mechanism itself is covered by Task 4. The marked run is byte-identical to what
 * the plugin emits, so this is a faithful stand-in.
 */
function suggestInsert(p: Peer, at: number, t: string, author = 'alice') {
  p.editor.commands.command(({ tr, dispatch, state }) => {
    const ins = state.schema.marks.insertion
    if (dispatch && ins) {
      tr.insert(at, state.schema.text(t, [ins.create({ author, color: '#1a73e8' })]))
      dispatch(tr)
    }
    return true
  })
}

describe('suggestion mode × Yjs convergence (Task 6)', () => {
  it('an accepted insertion on editor2 converges back to editor1 with the mark gone', () => {
    const e1 = track(makePeer('<p>start</p>'))
    const e2 = track(makePeer())
    e1.syncTo(e2)
    expect(text(e2)).toBe('start')

    // editor1 types "abc" as a tracked insertion at pos 1 (start of paragraph text).
    suggestInsert(e1, 1, 'abc')
    expect(hasInsertionMark(e1)).toBe(true)
    e1.syncTo(e2)
    expect(text(e2)).toContain('abc')
    expect(hasInsertionMark(e2)).toBe(true)

    // editor2 accepts the "abc" insertion (positions 1..4 on e2).
    e2.editor.commands.acceptChange(1, 4, 'insertion')
    e2.syncTo(e1)

    // Both docs identical; "abc" kept as plain text with NO insertion mark.
    expect(text(e1)).toBe(text(e2))
    expect(json(e1)).toBe(json(e2))
    expect(hasInsertionMark(e1)).toBe(false)
    expect(hasInsertionMark(e2)).toBe(false)
    expect(text(e1)).toContain('abc')
  })

  it('the hazard: a peer typing elsewhere while another accepts — both runs converge', () => {
    const e1 = track(makePeer('<p>HOME</p>'))
    const e2 = track(makePeer())
    e1.syncTo(e2)

    // editor1 types "abc" at pos 1 (insertion) but does NOT sync yet.
    suggestInsert(e1, 1, 'abc')
    // editor2 (which does NOT yet see "abc") types "xyz" at the END (after "HOME").
    const e2End = e2.editor.state.doc.content.size - 1 // before closing </p>
    suggestInsert(e2, e2End, 'xyz')

    // Sync both ways — CRDT merges the two disjoint insertions.
    e1.syncTo(e2)

    // editor2 now accepts the "abc" run. Find it by scanning for the insertion mark
    // authored "alice" over "abc".
    let abcFrom = -1
    e2.editor.state.doc.descendants((node, pos) => {
      if (
        node.isText &&
        node.text === 'abc' &&
        node.marks.some((m) => m.type.name === 'insertion')
      ) {
        abcFrom = pos
      }
      return true
    })
    expect(abcFrom).toBeGreaterThanOrEqual(0)
    e2.editor.commands.acceptChange(abcFrom, abcFrom + 3, 'insertion')
    e2.syncTo(e1)

    // Convergence: docs identical, both inserted runs survive.
    expect(json(e1)).toBe(json(e2))
    expect(text(e1)).toContain('abc')
    expect(text(e1)).toContain('xyz')
    expect(text(e1)).toContain('HOME')
    // "xyz" is still a pending (unaccepted) insertion; "abc" was accepted (no mark
    // over "abc", but the "xyz" run keeps its insertion mark).
    let xyzStillMarked = false
    e1.editor.state.doc.descendants((node) => {
      if (
        node.isText &&
        node.text === 'xyz' &&
        node.marks.some((m) => m.type.name === 'insertion')
      ) {
        xyzStillMarked = true
      }
      return true
    })
    expect(xyzStillMarked).toBe(true)
  })
})
