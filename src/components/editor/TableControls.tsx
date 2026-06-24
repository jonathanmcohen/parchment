'use client'

import type { Editor } from '@tiptap/core'
import { recomputeFormulas } from '@/lib/editor/formula-cells'
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
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          add_row_above
        </span>
      </button>
      <button
        type="button"
        aria-label="Add row after"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          add_row_below
        </span>
      </button>
      <button
        type="button"
        aria-label="Delete row"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().deleteRow().run()}
      >
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          delete
        </span>
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
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          add_column_left
        </span>
      </button>
      <button
        type="button"
        aria-label="Add column after"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          add_column_right
        </span>
      </button>
      <button
        type="button"
        aria-label="Delete column"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          delete
        </span>
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
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          cell_merge
        </span>
      </button>
      <button
        type="button"
        aria-label="Split cell"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().splitCell().run()}
      >
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          call_split
        </span>
      </button>
      <button
        type="button"
        aria-label="Toggle header row"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      >
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          toggle_on
        </span>
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
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          arrow_upward_alt
        </span>
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
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          arrow_downward_alt
        </span>
      </button>

      <span className="parchment-toolbar-sep" aria-hidden="true" />

      {/* ── Formulas ──────────────────────────────────────────────── */}
      <button
        type="button"
        aria-label="Recompute formulas"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => recomputeFormulas(editor)}
      >
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          functions
        </span>
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
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          grid_off
        </span>
      </button>
    </fieldset>
  )
}
