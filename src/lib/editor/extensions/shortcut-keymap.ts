import { Extension } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'

// ── v0.2.10: user-friendly keyboard shortcuts ───────────────────────────────
//
// A dedicated, high-PRIORITY keymap extension that adds the Docs/Notion muscle-
// memory shortcuts users expect, plus a few app-level conveniences. It is kept
// deliberately small: pure editor commands live here; the three that need React
// UI (insert-link dialog, add-comment composer, shortcuts pop-out) are delegated
// to callbacks supplied by Editor.tsx (same pattern as FindReplaceExtension's
// onOpen). Wire the CONFIGURED instance via makeShortcutKeymap({...}) in the
// editor's extension list.
//
// WHY HIGH PRIORITY: Tiptap builds one ProseMirror keymap plugin per extension
// and registers them in priority order (higher first); ProseMirror runs keymap
// plugins first-match-wins. StarterKit's hardBreak binds `Mod-Enter` (and the
// base keymap has a `Mod-Enter` too). To make `Mod-Enter → page break` win we
// must register our keymap BEFORE those — i.e. with priority > the default 100.
// Shift-Enter is left entirely alone, so the soft line break still works.

// ── Module augmentation ─────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    shortcutKeymap: {
      /**
       * Move the top-level block containing the current selection up or down,
       * swapping it with its adjacent sibling. Yjs-safe: a SINGLE transaction.
       * Returns false (a graceful no-op) at the document boundary.
       */
      moveBlock: (dir: 'up' | 'down') => ReturnType
      /**
       * Duplicate the top-level block containing the current selection,
       * inserting the copy immediately after it. A single transaction.
       */
      duplicateBlock: () => ReturnType
      /** Convert the current block to a normal paragraph (Mod-Alt-0). */
      normalText: () => ReturnType
    }
  }
}

// ── Options ─────────────────────────────────────────────────────────────────

export interface ShortcutKeymapOptions {
  /** Open the insert/edit-link dialog (Mod-Shift-K). */
  onInsertLink?: () => void
  /** Start a new comment on the current selection (Mod-Alt-M). */
  onAddComment?: () => void
  /** Open the keyboard-shortcuts pop-out (Mod-/). */
  onShowShortcuts?: () => void
}

// ── Top-level block helpers ──────────────────────────────────────────────────
//
// "Current block" means the direct child of the document that contains the
// selection head — the unit a user perceives as a block in Docs/Notion. Working
// at depth 1 keeps the operations predictable and each a single transaction.

interface TopBlock {
  index: number
  node: PmNode
  start: number // position just before the block
  end: number // position just after the block
}

/**
 * Resolve the top-level block at `pos` (use selection.from), or null.
 *
 * Works for BOTH selection shapes:
 *  - a cursor/TextSelection inside a block → $pos.depth >= 1, index(0) is the
 *    depth-1 ancestor's index;
 *  - a NodeSelection on a top-level atom (e.g. a clicked pageBreak) → depth is
 *    0 and index(0) is the index of the node immediately after the position,
 *    which IS the selected node.
 */
function topBlockAt(doc: PmNode, pos: number): TopBlock | null {
  const $pos = doc.resolve(pos)
  const index = $pos.index(0)
  if (index >= doc.childCount) return null
  const node = doc.child(index)
  let start = 0
  for (let i = 0; i < index; i++) start += doc.child(i).nodeSize
  return { index, node, start, end: start + node.nodeSize }
}

// ── Extension factory ────────────────────────────────────────────────────────

const shortcutKeymapExtension = Extension.create<ShortcutKeymapOptions>({
  name: 'shortcutKeymap',

  // Win over StarterKit's hardBreak / base keymap for Mod-Enter, and over any
  // other default that shares a combo we bind. 100 is the Tiptap default.
  priority: 1000,

  addOptions(): ShortcutKeymapOptions {
    return {}
  },

  addCommands() {
    return {
      moveBlock:
        (dir) =>
        ({ state, tr, dispatch }) => {
          const { doc, selection } = state
          const block = topBlockAt(doc, selection.from)
          if (!block) return false

          const childCount = doc.childCount
          // Graceful boundary no-ops.
          if (dir === 'up' && block.index === 0) return false
          if (dir === 'down' && block.index === childCount - 1) return false

          const neighborIndex = dir === 'up' ? block.index - 1 : block.index + 1
          const neighbor = doc.child(neighborIndex)
          // Neighbor's start position.
          let neighborStart = 0
          for (let i = 0; i < neighborIndex; i++) neighborStart += doc.child(i).nodeSize

          if (!dispatch) return true

          // ONE transaction: remove the block, then re-insert it on the far
          // side of the neighbor (before it when moving up, after it when
          // moving down). Deleting first and mapping the insert position
          // through the deletion keeps the math simple and the step coherent —
          // Collaboration turns the whole tr into a single CRDT update.
          const cursorOffset = selection.from - block.start // keep cursor inside
          const target = dir === 'up' ? neighborStart : neighborStart + neighbor.nodeSize

          tr.delete(block.start, block.end)
          const insertPos = tr.mapping.map(target)
          tr.insert(insertPos, block.node)
          const newHead = Math.min(insertPos + cursorOffset, tr.doc.content.size)
          tr.setSelection(Selection.near(tr.doc.resolve(newHead)))

          dispatch(tr.scrollIntoView())
          return true
        },

      duplicateBlock:
        () =>
        ({ state, tr, dispatch }) => {
          const { doc, selection } = state
          const block = topBlockAt(doc, selection.from)
          if (!block) return false
          if (!dispatch) return true
          // Insert a copy immediately after the current block. A node is
          // immutable so re-inserting the same node instance is safe.
          tr.insert(block.end, block.node)
          dispatch(tr.scrollIntoView())
          return true
        },

      normalText:
        () =>
        ({ commands }) =>
          commands.setNode('paragraph'),
    }
  },

  addKeyboardShortcuts() {
    // EVERY binding returns true even when its command is a no-op. Falling
    // through would surrender the key to a lower-priority binding or to the
    // BROWSER default, which is never what the user meant here: Mod-Enter
    // would insert a hard break, Mod-D would open the bookmark dialog, and a
    // boundary Mod-Shift-ArrowUp would native-select to the top of the doc —
    // destructive if the user keeps typing. Swallow, always.
    return {
      // 1. Headline: Mod-Enter → page break (paged AND continuous layout).
      //    insertPageBreak is the SAME command the slash menu uses. Shift-Enter
      //    is untouched (StarterKit hardBreak keeps the soft line break).
      //
      //    CURSOR FIX (live-verify finding): inserting the atom at the END of a
      //    block leaves a NodeSelection ON the pageBreak, so the user's very
      //    next keystroke would REPLACE the break they just inserted. Hop the
      //    selection to the nearest text position after the break (the doc's
      //    trailing-paragraph auto-fill guarantees one exists), matching the
      //    Docs behaviour of "cursor starts on the new page, ready to type".
      'Mod-Enter': () => {
        this.editor
          .chain()
          .focus()
          .insertPageBreak()
          .command(({ tr, dispatch }) => {
            const sel = tr.selection
            if (sel instanceof NodeSelection && sel.node.type.name === 'pageBreak') {
              if (dispatch) {
                // Inside THIS transaction the trailing-node auto-fill has not
                // run yet (it is an appendTransaction), so when the break is
                // the last node there is no text position after it — create
                // the paragraph ourselves, still within the same single tr.
                const after = sel.to
                const nextNode = tr.doc.resolve(after).nodeAfter
                if (!nextNode || !nextNode.isTextblock) {
                  const paragraph = tr.doc.type.schema.nodes.paragraph
                  if (paragraph) tr.insert(after, paragraph.create())
                }
                tr.setSelection(
                  TextSelection.create(tr.doc, Math.min(after + 1, tr.doc.content.size)),
                )
              }
            }
            return true
          })
          .run()
        return true
      },

      // 2. Mod-Shift-K → insert/edit link (Mod-K is the command palette).
      'Mod-Shift-k': () => {
        this.options.onInsertLink?.()
        return true
      },

      // 3. Mod-Alt-M → new comment on the current selection.
      'Mod-Alt-m': () => {
        this.options.onAddComment?.()
        return true
      },

      // 4. Mod-Alt-0 → normal text (paragraph). StarterKit already binds this via
      //    the paragraph extension; we bind it here too so it is guaranteed and
      //    self-documenting alongside the Mod-Alt-1..6 heading defaults.
      'Mod-Alt-0': () => {
        this.editor.chain().focus().normalText().run()
        return true
      },

      // 6. Mod-Shift-ArrowUp / ArrowDown → move current block up/down. At a doc
      //    boundary the command no-ops but the key is STILL swallowed so the
      //    native select-to-document-edge cannot fire mid-muscle-memory.
      'Mod-Shift-ArrowUp': () => {
        this.editor.chain().focus().moveBlock('up').run()
        return true
      },
      'Mod-Shift-ArrowDown': () => {
        this.editor.chain().focus().moveBlock('down').run()
        return true
      },

      // 7. Mod-D → duplicate current block (preventDefault overrides the
      //    browser bookmark dialog).
      'Mod-d': () => {
        this.editor.chain().focus().duplicateBlock().run()
        return true
      },

      // 8. Mod-/ → open the keyboard-shortcuts pop-out. Editor-focused; the
      //    callback dispatches the app-level `shortcuts-help` action (the
      //    app-wide Mod-Shift-/ chord opens the same dialog everywhere).
      'Mod-/': () => {
        this.options.onShowShortcuts?.()
        return true
      },
    }
  },
})

/** The un-configured extension (useful for tests / default wiring). */
export const ShortcutKeymap = shortcutKeymapExtension

/** Configure the shortcut keymap with the UI callbacks it delegates to. */
export function makeShortcutKeymap(options: ShortcutKeymapOptions) {
  return shortcutKeymapExtension.configure(options)
}
