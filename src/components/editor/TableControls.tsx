'use client'

import type { Editor } from '@tiptap/core'
import { sortTableByColumn } from '@/lib/editor/table-sort'

type Props = {
  editor: Editor
}

// Prevent the toolbar from stealing the editor selection on click.
const keepSelection = (e: React.MouseEvent) => e.preventDefault()

/**
 * Context-sensitive table control cluster.
 * Rendered by Toolbar when the cursor is inside a table node.
 * All buttons use onMouseDown preventDefault to preserve selection.
 */
export function TableControls({ editor }: Props) {
  return (
    <fieldset className="parchment-table-controls" aria-label="Table controls">
      {/* ── Row operations ─────────────────────────────────────────── */}
      <button
        type="button"
        aria-label="Add row before"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().addRowBefore().run()}
      >
        ↑+
      </button>
      <button
        type="button"
        aria-label="Add row after"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        ↓+
      </button>
      <button
        type="button"
        aria-label="Delete row"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().deleteRow().run()}
      >
        ↕✕
      </button>

      <span className="parchment-toolbar-sep" aria-hidden="true" />

      {/* ── Column operations ──────────────────────────────────────── */}
      <button
        type="button"
        aria-label="Add column before"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      >
        ←+
      </button>
      <button
        type="button"
        aria-label="Add column after"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        →+
      </button>
      <button
        type="button"
        aria-label="Delete column"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        ↔✕
      </button>

      <span className="parchment-toolbar-sep" aria-hidden="true" />

      {/* ── Cell operations ────────────────────────────────────────── */}
      <button
        type="button"
        aria-label="Merge cells"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().mergeCells().run()}
      >
        ⊞
      </button>
      <button
        type="button"
        aria-label="Split cell"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().splitCell().run()}
      >
        ⊟
      </button>
      <button
        type="button"
        aria-label="Toggle header row"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      >
        H↔
      </button>

      <span className="parchment-toolbar-sep" aria-hidden="true" />

      {/* ── Sort ──────────────────────────────────────────────────── */}
      <button
        type="button"
        aria-label="Sort by this column ascending"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => {
          // Determine column index from selection
          const { state } = editor
          const { selection } = state
          // CellSelection exposes $anchorCell; fall back to column 0
          // biome-ignore lint/suspicious/noExplicitAny: ProseMirror internal API
          const sel = selection as any
          const colIdx: number =
            typeof sel.$anchorCell?.pos === 'number'
              ? // Walk up to find the cell's index within its parent row
                (() => {
                  const $cell = sel.$anchorCell
                  // $cell.index(-1) gives index within the row
                  return $cell.index($cell.depth - 1)
                })()
              : 0
          sortTableByColumn(editor, colIdx, 'asc')
        }}
      >
        ↑Z
      </button>
      <button
        type="button"
        aria-label="Sort by this column descending"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => {
          const { state } = editor
          const { selection } = state
          // biome-ignore lint/suspicious/noExplicitAny: ProseMirror internal API
          const sel = selection as any
          const colIdx: number =
            typeof sel.$anchorCell?.pos === 'number'
              ? (() => {
                  const $cell = sel.$anchorCell
                  return $cell.index($cell.depth - 1)
                })()
              : 0
          sortTableByColumn(editor, colIdx, 'desc')
        }}
      >
        ↓Z
      </button>

      <span className="parchment-toolbar-sep" aria-hidden="true" />

      {/* ── Delete table ──────────────────────────────────────────── */}
      <button
        type="button"
        aria-label="Delete table"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().deleteTable().run()}
      >
        ✕⊞
      </button>
    </fieldset>
  )
}
