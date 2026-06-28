// @vitest-environment jsdom
//
// H Task 13 — in-process two-client collab test harness.
//
// `makePeer()` returns a Tiptap editor bound to a FRESH Y.Doc (via the
// Collaboration extension on `field: 'default'` — the same field Editor.tsx binds),
// plus `syncTo(other)` (a bidirectional Yjs state exchange) and an awareness pair
// so `setAwareness`/`applyAwarenessFrom` model "two browsers" with NO network.
//
// Consumed by the anchor-survival (Task 3), suggestion-convergence (Task 6) and
// presence (Task 14) tests. NOT a *.test.ts file — it exports helpers only.

import { Editor } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

const FIELD = 'default'

export interface Peer {
  editor: Editor
  ydoc: Y.Doc
  awareness: Awareness
  /** Push THIS peer's full Yjs state into `other` (one direction). */
  pushTo(other: Peer): void
  /** Bidirectional state exchange — both peers converge to the union. */
  syncTo(other: Peer): void
  /** Set a local awareness field (models `provider.setAwarenessField`). */
  setAwareness(field: string, value: unknown): void
  /** Apply `other`'s current awareness state into this peer's awareness map. */
  applyAwarenessFrom(other: Peer): void
  destroy(): void
}

/**
 * Build a collab peer. When `initialContent` is given, it is set on the editor
 * AFTER binding (so it lands in the bound Y.Doc fragment exactly as a real first
 * edit would). Pass nothing for an empty peer that receives content via `syncTo`.
 */
export function makePeer(initialContent?: string): Peer {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)

  // Mount to a real (jsdom) element: the y-prosemirror ySync plugin only creates
  // its prosemirror↔yjs binding inside the EditorView `view()` lifecycle, which
  // runs only when the editor is attached to a DOM node. Without an element the
  // binding never exists and serializeAnchor would always return null.
  const element = document.createElement('div')
  document.body.appendChild(element)

  const editor = new Editor({
    element,
    extensions: [...baseExtensions, Collaboration.configure({ document: ydoc, field: FIELD })],
    // Collaboration ignores the `content` option (the Y.Doc is the source of
    // truth), so seed via setContent below instead.
  })

  if (initialContent !== undefined) {
    // `emitUpdate:false` keeps this seeding out of the editor's onUpdate, but it
    // still writes through the y-prosemirror binding into the Y.Doc fragment.
    editor.commands.setContent(initialContent, { emitUpdate: false })
  }

  const peer: Peer = {
    editor,
    ydoc,
    awareness,
    pushTo(other) {
      Y.applyUpdate(other.ydoc, Y.encodeStateAsUpdate(ydoc))
    },
    syncTo(other) {
      // Exchange both directions so the two docs converge to the merged state.
      const a = Y.encodeStateAsUpdate(ydoc)
      const b = Y.encodeStateAsUpdate(other.ydoc)
      Y.applyUpdate(other.ydoc, a)
      Y.applyUpdate(ydoc, b)
    },
    setAwareness(field, value) {
      awareness.setLocalStateField(field, value)
    },
    applyAwarenessFrom(other) {
      const clients = Array.from(other.awareness.getStates().keys())
      const update = encodeAwarenessUpdate(other.awareness, clients)
      applyAwarenessUpdate(awareness, update, 'harness')
    },
    destroy() {
      awareness.destroy()
      editor.destroy()
      ydoc.destroy()
      element.remove()
    },
  }

  return peer
}
