// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { makePeer, type Peer } from './collab-harness'

// H Task 13 smoke test — proves the harness models two browsers: edits on each
// peer converge after syncTo, and awareness fields cross over.

const peers: Peer[] = []
function track(p: Peer): Peer {
  peers.push(p)
  return p
}

afterEach(() => {
  while (peers.length) peers.pop()?.destroy()
})

function text(p: Peer): string {
  return p.editor.state.doc.textContent
}

describe('collab harness smoke', () => {
  it('two peers with initial content + edits on each converge', () => {
    const p1 = track(makePeer('<p>hello world</p>'))
    const p2 = track(makePeer())

    // p2 is empty; pull p1's seeded content in.
    p1.syncTo(p2)
    expect(text(p2)).toBe('hello world')

    // Type on each peer in disjoint spots, then converge.
    // p1: append " A" at the very end of the paragraph text.
    const endP1 = p1.editor.state.doc.content.size - 1
    p1.editor.commands.insertContentAt(endP1, ' A')
    // p2: prepend "B " at the start of the paragraph text (pos 1 is inside the <p>).
    p2.editor.commands.insertContentAt(1, 'B ')

    p1.syncTo(p2)

    // Both docs are now identical (CRDT merge) and contain both edits.
    expect(text(p1)).toBe(text(p2))
    expect(text(p1)).toContain('hello world')
    expect(text(p1)).toContain('A')
    expect(text(p1)).toContain('B')
  })

  it('awareness fields set on one peer are observable on the other', () => {
    const p1 = track(makePeer('<p>x</p>'))
    const p2 = track(makePeer('<p>x</p>'))

    p1.setAwareness('user', { name: 'Alice', color: '#1a73e8' })
    p2.applyAwarenessFrom(p1)

    const states = p2.awareness.getStates()
    const remote = Array.from(states.values()).find(
      (s) => (s.user as { name?: string } | undefined)?.name === 'Alice',
    )
    expect(remote).toBeDefined()
    expect((remote?.user as { color?: string }).color).toBe('#1a73e8')
  })
})
