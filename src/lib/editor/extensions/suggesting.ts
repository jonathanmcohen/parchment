// ── D2 Suggesting mode — tracked insertions / deletions ───────────────────
//
// While suggesting mode is ON:
//   • Text typed → wrapped in an `insertion` mark (underline, author colour).
//   • Backspace / Delete (and delete-of-selection) → does NOT remove the text;
//     instead applies a `deletion` mark (strikethrough) and moves the cursor.
//
// Accept / reject commands use resolveChange() semantics from track-changes.ts.
//
// YJS INTERACTION (Task 6 — RESOLVED): insertion/deletion are plain ProseMirror
// MARKS stored in the doc content, so they sync through Yjs natively like any other
// formatting — two clients in suggestion mode produce a correctly-merged set of
// tracked changes with NO suggestion-specific awareness, locking, or extra CRDT
// plumbing. Accept/reject is a LOCAL transaction that the CRDT merges: tests in
// suggesting-collab.test.ts prove that (a) an accept on one client converges back
// to the other with the mark gone and the docs byte-identical, and (b) the hazard
// case — a peer typing a separate insertion while another accepts — converges with
// both runs intact. No change to accept/reject was needed for collaboration.
//
// Edge cases:
//   • Cut via Cmd-X / Ctrl-X — CLOSED (Task 4): handleDOMEvents.cut converts the
//     removal into a tracked deletion (the clipboard copy still happens).
//   • Pasting over a selection — CLOSED (Task 4): handlePaste deletion-marks the
//     replaced text and insertion-marks the pasted text (no silent loss).
//   • Node-level deletions (deleting a whole image/block via NodeSelection) —
//     CLOSED (Task 4): the silent hard-delete is BLOCKED; a textblock's content is
//     deletion-marked, an atom/leaf is refused so it cannot vanish untracked.
//   • IME composition (mobile / CJK) — STILL a GAP: insertions may not be captured
//     atomically (cosmetic; defer — needs compositionend handling).
//   • Format-change tracking (bold, colour, etc.) — STILL a GAP (defer; out of
//     scope for v0.2.0 data-integrity work).

import { Extension, Mark, mergeAttributes } from '@tiptap/core'
import type { Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { authorColor, collectChanges, resolveChange } from '@/lib/editor/track-changes'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  // Augment the global Storage registry so editor.storage.suggesting is typed.
  interface Storage {
    suggesting: SuggestingStorage
  }

  interface Commands<ReturnType> {
    suggesting: {
      /** Enable or disable suggesting mode. */
      setSuggesting: (enabled: boolean) => ReturnType
      /** Toggle suggesting mode on/off. */
      toggleSuggesting: () => ReturnType
      /** Accept a single tracked change in [from, to) and remove its mark. */
      acceptChange: (from: number, to: number, type: 'insertion' | 'deletion') => ReturnType
      /** Reject a single tracked change in [from, to) and remove its mark. */
      rejectChange: (from: number, to: number, type: 'insertion' | 'deletion') => ReturnType
      /** Accept all tracked changes in the document. */
      acceptAllChanges: () => ReturnType
      /** Reject all tracked changes in the document. */
      rejectAllChanges: () => ReturnType
    }
  }
}

// ── Plugin state ───────────────────────────────────────────────────────────

interface SuggestingState {
  enabled: boolean
  author: string
}

const suggestingKey = new PluginKey<SuggestingState>('suggesting')

// ── Insertion mark ─────────────────────────────────────────────────────────

export const InsertionMark = Mark.create({
  name: 'insertion',
  spanning: true,
  inclusive: true,

  addAttributes() {
    return {
      author: {
        default: 'You',
        parseHTML: (el) => el.getAttribute('data-author'),
        renderHTML: (attrs) => ({ 'data-author': attrs.author as string }),
      },
      color: {
        default: '#1d4ed8',
        parseHTML: (el) => el.getAttribute('data-color'),
        renderHTML: (attrs) => ({ 'data-color': attrs.color as string }),
      },
      createdAt: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-created-at'),
        renderHTML: (attrs) => {
          const v = attrs.createdAt as string | null
          return v ? { 'data-created-at': v } : {}
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span.parchment-suggest-ins' }]
  },

  renderHTML({ HTMLAttributes }) {
    const color = HTMLAttributes['data-color'] as string | undefined
    return [
      'span',
      mergeAttributes(
        { class: 'parchment-suggest-ins' },
        color ? { style: `text-decoration-color: ${color}; color: ${color};` } : {},
        HTMLAttributes,
      ),
      0,
    ]
  },
})

// ── Deletion mark ──────────────────────────────────────────────────────────

export const DeletionMark = Mark.create({
  name: 'deletion',
  spanning: true,
  inclusive: false,

  addAttributes() {
    return {
      author: {
        default: 'You',
        parseHTML: (el) => el.getAttribute('data-author'),
        renderHTML: (attrs) => ({ 'data-author': attrs.author as string }),
      },
      color: {
        default: '#be123c',
        parseHTML: (el) => el.getAttribute('data-color'),
        renderHTML: (attrs) => ({ 'data-color': attrs.color as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span.parchment-suggest-del' }]
  },

  renderHTML({ HTMLAttributes }) {
    const color = HTMLAttributes['data-color'] as string | undefined
    return [
      'span',
      mergeAttributes(
        { class: 'parchment-suggest-del' },
        color ? { style: `text-decoration-color: ${color}; color: ${color};` } : {},
        HTMLAttributes,
      ),
      0,
    ]
  },
})

// ── Shared tracked-deletion helpers (Task 4) ───────────────────────────────
//
// Marks a non-empty TEXT range as a tracked deletion: existing insertion-marked
// text in the range is hard-removed (rejecting that author's own pending
// insertion), all other text gets a deletion mark. Returns the transaction (NOT
// dispatched) so callers can chain (e.g. paste-over inserts after this). Builds on
// `view.state.tr`; the caller dispatches.
function buildTrackedDeletion(
  view: EditorView,
  from: number,
  to: number,
  author: string,
  color: string,
): Transaction {
  const { state } = view
  const tr = state.tr
  const deletionMarkType = state.schema.marks.deletion
  if (!deletionMarkType) return tr

  const removals: Array<{ f: number; t: number }> = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true
    const nodeFrom = Math.max(from, pos)
    const nodeTo = Math.min(to, pos + node.nodeSize)
    if (nodeFrom >= nodeTo) return false
    const hasInsertion = node.marks.some((m) => m.type.name === 'insertion')
    if (hasInsertion) {
      removals.push({ f: nodeFrom, t: nodeTo })
    } else {
      tr.addMark(nodeFrom, nodeTo, deletionMarkType.create({ author, color }))
    }
    return false
  })
  for (const r of removals.sort((a, b) => b.f - a.f)) {
    tr.delete(tr.mapping.map(r.f), tr.mapping.map(r.t))
  }
  return tr
}

// ── Suggesting extension ───────────────────────────────────────────────────

export type SuggestingOptions = {
  /** The author name / id used for new tracked changes. Default: 'You'. */
  defaultAuthor: string
}

export type SuggestingStorage = {
  enabled: boolean
  author: string
}

export const Suggesting = Extension.create<SuggestingOptions, SuggestingStorage>({
  name: 'suggesting',

  addOptions(): SuggestingOptions {
    return { defaultAuthor: 'You' }
  },

  addStorage(): SuggestingStorage {
    return { enabled: false, author: 'You' }
  },

  onBeforeCreate() {
    this.storage.author = this.options.defaultAuthor
  },

  // Register the two marks so PM knows about them when this extension is added.
  addExtensions() {
    return [InsertionMark, DeletionMark]
  },

  addCommands() {
    return {
      // ── Toggle ─────────────────────────────────────────────────────────
      setSuggesting:
        (enabled: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(suggestingKey, { type: 'setEnabled', enabled })
            dispatch(tr)
          }
          this.storage.enabled = enabled
          return true
        },

      toggleSuggesting:
        () =>
        ({ tr, dispatch }) => {
          const next = !this.storage.enabled
          if (dispatch) {
            tr.setMeta(suggestingKey, { type: 'setEnabled', enabled: next })
            dispatch(tr)
          }
          this.storage.enabled = next
          return true
        },

      // ── Single-change accept/reject ────────────────────────────────────
      acceptChange:
        (from: number, to: number, type: 'insertion' | 'deletion') =>
        ({ tr, dispatch }) => {
          const result = resolveChange('accept', type)
          if (dispatch) {
            if (result === 'remove-text') {
              tr.delete(from, to)
            } else {
              const markType =
                type === 'insertion'
                  ? tr.doc.type.schema.marks.insertion
                  : tr.doc.type.schema.marks.deletion
              if (markType) tr.removeMark(from, to, markType)
            }
            dispatch(tr)
          }
          return true
        },

      rejectChange:
        (from: number, to: number, type: 'insertion' | 'deletion') =>
        ({ tr, dispatch }) => {
          const result = resolveChange('reject', type)
          if (dispatch) {
            if (result === 'remove-text') {
              tr.delete(from, to)
            } else {
              const markType =
                type === 'insertion'
                  ? tr.doc.type.schema.marks.insertion
                  : tr.doc.type.schema.marks.deletion
              if (markType) tr.removeMark(from, to, markType)
            }
            dispatch(tr)
          }
          return true
        },

      // ── Accept all ────────────────────────────────────────────────────
      acceptAllChanges:
        () =>
        ({ tr, state, dispatch }) => {
          const changes = collectChanges(state.doc.toJSON())
          if (!dispatch) return true

          // Process right-to-left so positions stay valid
          const sorted = [...changes].sort((a, b) => b.from - a.from)
          for (const c of sorted) {
            const result = resolveChange('accept', c.type)
            const mappedFrom = tr.mapping.map(c.from)
            const mappedTo = tr.mapping.map(c.to)
            if (result === 'remove-text') {
              tr.delete(mappedFrom, mappedTo)
            } else {
              const markName = c.type === 'insertion' ? 'insertion' : 'deletion'
              const markType = state.schema.marks[markName]
              if (markType) tr.removeMark(mappedFrom, mappedTo, markType)
            }
          }
          dispatch(tr)
          return true
        },

      // ── Reject all ────────────────────────────────────────────────────
      rejectAllChanges:
        () =>
        ({ tr, state, dispatch }) => {
          const changes = collectChanges(state.doc.toJSON())
          if (!dispatch) return true

          const sorted = [...changes].sort((a, b) => b.from - a.from)
          for (const c of sorted) {
            const result = resolveChange('reject', c.type)
            const mappedFrom = tr.mapping.map(c.from)
            const mappedTo = tr.mapping.map(c.to)
            if (result === 'remove-text') {
              tr.delete(mappedFrom, mappedTo)
            } else {
              const markName = c.type === 'insertion' ? 'insertion' : 'deletion'
              const markType = state.schema.marks[markName]
              if (markType) tr.removeMark(mappedFrom, mappedTo, markType)
            }
          }
          dispatch(tr)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const getStorage = () => this.storage

    return [
      new Plugin({
        key: suggestingKey,

        // ── Plugin state ────────────────────────────────────────────────
        state: {
          init(): SuggestingState {
            return { enabled: false, author: 'You' }
          },
          apply(tr, prev): SuggestingState {
            const meta = tr.getMeta(suggestingKey) as
              | { type: 'setEnabled'; enabled: boolean }
              | undefined
            if (meta?.type === 'setEnabled') {
              return { ...prev, enabled: meta.enabled }
            }
            return prev
          },
        },

        // ── Key handlers (Backspace / Delete intercept) ─────────────────
        props: {
          handleKeyDown(view, event) {
            const pluginState = suggestingKey.getState(view.state)
            if (!pluginState?.enabled) return false

            const { key } = event
            if (key !== 'Backspace' && key !== 'Delete') return false

            const { state } = view
            const { selection } = state
            const { from, to, empty } = selection
            const storage = getStorage()
            const author = storage.author
            const color = authorColor(author)

            const deletionMarkType = state.schema.marks.deletion
            if (!deletionMarkType) return false
            const insertionMarkType = state.schema.marks.insertion

            // Helper: does a range consist entirely of deletion-marked text?
            const isAlreadyDeleted = (f: number, t: number): boolean => {
              let allDeleted = true
              state.doc.nodesBetween(f, t, (node) => {
                if (node.isText) {
                  if (!node.marks.some((m) => m.type.name === 'deletion')) {
                    allDeleted = false
                  }
                }
                return true
              })
              return allDeleted
            }

            const tr = state.tr

            // Node-level delete (a NodeSelection over a whole block/leaf, e.g. an
            // image). A hard delete would silently drop the node with NO tracked
            // change — a data-integrity gap. We BLOCK the delete and (for a text-
            // containing block) deletion-mark its text; for an atom/leaf with no
            // text (image, hr) we simply refuse the delete so it can't vanish
            // without an explicit accept. (Full node-deletion tracking would need a
            // block-level deletion flag; refusing the silent drop is the floor.)
            const isNodeSelection =
              (selection as { node?: unknown }).node !== undefined &&
              (selection as { node?: unknown }).node !== null
            if (isNodeSelection) {
              const selNode = (selection as unknown as { node: { isTextblock: boolean } }).node
              if (selNode.isTextblock) {
                // Mark the textblock's inner text as deleted instead of removing it.
                const innerFrom = from + 1
                const innerTo = to - 1
                if (innerTo > innerFrom) {
                  const dtr = buildTrackedDeletion(view, innerFrom, innerTo, author, color)
                  view.dispatch(dtr)
                }
              }
              // Either way, do NOT let the default handler hard-delete the node.
              return true
            }

            if (!empty) {
              // Selection delete: mark the selected range as deleted (shared helper).
              const dtr = buildTrackedDeletion(view, from, to, author, color)
              dtr.setSelection(TextSelection.create(dtr.doc, dtr.mapping.map(from)))
              view.dispatch(dtr)
              return true
            }

            // Single-character delete (no selection)
            if (key === 'Backspace') {
              const deletePos = from - 1
              if (deletePos < 0) return false

              // If cursor is at the start of a node, skip (cross-node Backspace is complex)
              const resolved = state.doc.resolve(from)
              if (resolved.parentOffset === 0) return false

              const nodeAtPos = state.doc.nodeAt(deletePos)
              if (!nodeAtPos?.isText) return false

              // Skip if already deletion-marked
              if (isAlreadyDeleted(deletePos, from)) {
                // Move cursor left past the already-deleted char
                tr.setSelection(TextSelection.create(state.doc, deletePos))
                view.dispatch(tr)
                return true
              }

              // If the char has an insertion mark, just delete it (reject the insertion)
              if (insertionMarkType && nodeAtPos.marks.some((m) => m.type.name === 'insertion')) {
                tr.delete(deletePos, from)
                view.dispatch(tr)
                return true
              }

              // Mark as deleted, move cursor left of it
              tr.addMark(deletePos, from, deletionMarkType.create({ author, color }))
              tr.setSelection(TextSelection.create(tr.doc, deletePos))
              view.dispatch(tr)
              return true
            }

            // Delete key
            if (key === 'Delete') {
              const nodeAtPos = state.doc.nodeAt(from)
              if (!nodeAtPos?.isText) return false
              const deleteEnd = from + 1

              if (isAlreadyDeleted(from, deleteEnd)) {
                // Cursor stays, skip over the already-deleted char
                tr.setSelection(TextSelection.create(state.doc, deleteEnd))
                view.dispatch(tr)
                return true
              }

              if (insertionMarkType && nodeAtPos.marks.some((m) => m.type.name === 'insertion')) {
                tr.delete(from, deleteEnd)
                view.dispatch(tr)
                return true
              }

              tr.addMark(from, deleteEnd, deletionMarkType.create({ author, color }))
              tr.setSelection(TextSelection.create(tr.doc, deleteEnd))
              view.dispatch(tr)
              return true
            }

            return false
          },

          // ── Paste-over-selection (Task 4) ─────────────────────────────
          // Default PM paste REPLACES the selection — the old text would vanish
          // with no tracked change. While suggesting, we instead: deletion-mark
          // the replaced selection, then insert the pasted slice at the collapse
          // point (the appendTransaction wrap then insertion-marks it). For a
          // collapsed cursor we let the default path run (appendTransaction marks
          // the insertion) and return false.
          handlePaste(view, _event, slice: Slice) {
            const pluginState = suggestingKey.getState(view.state)
            if (!pluginState?.enabled) return false
            const { selection } = view.state
            if (selection.empty) return false // collapsed: default insert + auto-mark

            const storage = getStorage()
            const author = storage.author
            const color = authorColor(author)
            const { from, to } = selection

            // 1) Mark the replaced selection as a tracked deletion.
            const tr = buildTrackedDeletion(view, from, to, author, color)
            // 2) Insert the pasted content at the (mapped) end of the old selection
            //    so it sits AFTER the struck-through text, then collapse there.
            const insertAt = tr.mapping.map(to)
            tr.insert(insertAt, slice.content)
            tr.setSelection(TextSelection.create(tr.doc, insertAt + slice.content.size))
            view.dispatch(tr)
            return true // handled — appendTransaction insertion-marks the new text
          },

          // ── Cut (Task 4) ──────────────────────────────────────────────
          // Cmd/Ctrl-X fires a `cut` DOM event whose default copies the selection
          // then deletes it (hard) — losing the text with no tracked change. While
          // suggesting, convert it into a tracked deletion (let the browser still
          // copy to the clipboard; we only intercept the removal).
          handleDOMEvents: {
            cut(view, event) {
              const pluginState = suggestingKey.getState(view.state)
              if (!pluginState?.enabled) return false
              const { selection } = view.state
              if (selection.empty) return false

              const storage = getStorage()
              const author = storage.author
              const color = authorColor(author)
              const { from, to } = selection

              const tr = buildTrackedDeletion(view, from, to, author, color)
              tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(from)))
              view.dispatch(tr)
              // Prevent the browser's default hard-delete; the copy already ran
              // (cut's default copy happens before our preventDefault for the
              // delete half — and the marked text stays selectable to re-copy).
              event.preventDefault()
              return true
            },
          },
        },

        // ── appendTransaction: wrap inserted text in insertion mark ──────
        appendTransaction(_transactions, oldState, newState) {
          const pluginState = suggestingKey.getState(newState)
          if (!pluginState?.enabled) return null
          if (!newState.doc.content.size) return null

          // Only act when the document changed
          if (oldState.doc.eq(newState.doc)) return null

          const storage = getStorage()
          const author = storage.author
          const color = authorColor(author)
          const createdAt = new Date().toISOString()

          const insertionMarkType = newState.schema.marks.insertion
          if (!insertionMarkType) return null
          const deletionMarkType = newState.schema.marks.deletion

          // Find text ranges that are new (present in newState but not oldState)
          // by comparing the two docs' text content.
          // Strategy: find the cursor position; the insertion is the range
          // [newSel.from - insertedLength .. newSel.from].
          // This works for normal typing. For paste we apply to the whole
          // changed range.
          const newSel = newState.selection
          const _oldSel = oldState.selection

          // Determine inserted range via diff of doc sizes
          const delta = newState.doc.content.size - oldState.doc.content.size
          if (delta <= 0) return null // net deletion or no change — handled by keydown

          // The inserted region is approximately [oldSel.from .. oldSel.from + delta]
          // mapped through the transaction. Use the new selection head as anchor.
          const insertEnd = newSel.from
          const insertStart = insertEnd - delta

          if (insertStart < 0 || insertEnd > newState.doc.content.size) return null

          // Don't double-mark text already carrying insertion mark or deletion mark
          const tr = newState.tr
          let modified = false

          newState.doc.nodesBetween(insertStart, insertEnd, (node, pos) => {
            if (!node.isText) return true
            const nodeFrom = Math.max(insertStart, pos)
            const nodeTo = Math.min(insertEnd, pos + node.nodeSize)
            if (nodeFrom >= nodeTo) return false

            const hasInsertion = node.marks.some((m) => m.type.name === 'insertion')
            const hasDeletion =
              deletionMarkType && node.marks.some((m) => m.type.name === 'deletion')
            if (!hasInsertion && !hasDeletion) {
              tr.addMark(nodeFrom, nodeTo, insertionMarkType.create({ author, color, createdAt }))
              modified = true
            }
            return false
          })

          return modified ? tr : null
        },
      }),
    ]
  },
})
