/**
 * table-controls.ts — v0.2.10 table UX pass.
 *
 * The pure, unit-tested command layer that the hover-affordance overlay
 * (TableControlsOverlay.tsx) drives. Everything here operates via Tiptap
 * commands / a single ProseMirror transaction so it is collab-safe (Yjs sees
 * one atomic change).
 *
 * Built on @tiptap/pm/tables primitives:
 *   • TableMap — the row×col geometry of a table node.
 *   • CellSelection.rowSelection / colSelection — select a whole row/column
 *     (the grip-click behaviour: click a grip → the row/col highlights).
 *   • selectedRect — the currently selected row/col rectangle, so a menu action
 *     (insert above/below, delete row/col) targets exactly what the grip picked.
 *
 * Geometry positions are ABSOLUTE document positions (table start + TableMap
 * cell offset), which the overlay maps to DOM rects via `view.coordsAtPos`.
 */

import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { findSelectedTable } from '@/lib/editor/table-utils'

/** The menu actions the row/column control menu can dispatch. */
export type TableMenuAction =
  | 'insertRowAbove'
  | 'insertRowBelow'
  | 'deleteRow'
  | 'insertColumnLeft'
  | 'insertColumnRight'
  | 'deleteColumn'
  | 'toggleHeaderRow'
  | 'toggleHeaderColumn'
  | 'deleteTable'

export interface TableGeometry {
  /** Absolute position of the table node's open token. */
  tablePos: number
  /** The table node. */
  node: PMNode
  /** Row count. */
  rows: number
  /** Column count. */
  cols: number
  /**
   * One absolute cell position per row — the first cell in that row. Used to
   * (a) place the row grip and (b) build a rowSelection when the grip is clicked.
   */
  rowAnchors: number[]
  /**
   * One absolute cell position per column — the top cell in that column. Used to
   * (a) place the column grip and (b) build a colSelection when clicked.
   */
  colAnchors: number[]
}

/**
 * Resolve a table into a flat geometry the overlay can position DOM handles
 * against.
 *
 * Two lookup modes:
 *   • no `atTablePos` — the table AROUND the current selection (cursor-in-table).
 *   • explicit `atTablePos` — that exact table node (the HOVER path: the overlay
 *     resolves the hovered <table> to its doc position via posAtCoords, so
 *     affordances appear on hover even when the cursor is elsewhere). The
 *     position is re-validated against the live doc, so a stale hover pos after
 *     an edit safely returns null instead of mis-targeting.
 */
export function getTableGeometry(editor: Editor, atTablePos?: number): TableGeometry | null {
  let node: PMNode | null = null
  let tablePos = -1
  if (typeof atTablePos === 'number') {
    const candidate =
      atTablePos >= 0 && atTablePos < editor.state.doc.content.size
        ? editor.state.doc.nodeAt(atTablePos)
        : null
    if (candidate?.type.name !== 'table') return null
    node = candidate
    tablePos = atTablePos
  } else {
    const found = findSelectedTable(editor.state)
    if (!found) return null
    node = found.node as PMNode
    tablePos = found.pos
  }
  const map = TableMap.get(node)
  // TableMap.map is a flat array of cell start offsets RELATIVE to the table
  // content start. Absolute cell pos = tablePos + 1 (table open token) + offset.
  const base = tablePos + 1

  const rowAnchors: number[] = []
  for (let r = 0; r < map.height; r++) {
    // First cell of row r: map.map[r * width + 0].
    const offset = map.map[r * map.width]
    if (typeof offset === 'number') rowAnchors.push(base + offset)
  }

  const colAnchors: number[] = []
  for (let c = 0; c < map.width; c++) {
    // Top cell of column c: map.map[0 * width + c].
    const offset = map.map[c]
    if (typeof offset === 'number') colAnchors.push(base + offset)
  }

  return {
    tablePos,
    node,
    rows: map.height,
    cols: map.width,
    rowAnchors,
    colAnchors,
  }
}

/**
 * Select an entire row by index (0-based). Dispatches a CellSelection.rowSelection
 * so the grip-click highlights the whole row. `tablePos` (optional) targets a
 * specific table — the hover path, where the cursor may be outside it. Returns
 * false for an out-of-range index or when no table resolves.
 */
export function selectTableRow(editor: Editor, rowIndex: number, tablePos?: number): boolean {
  const geo = getTableGeometry(editor, tablePos)
  if (!geo) return false
  const anchor = geo.rowAnchors[rowIndex]
  if (typeof anchor !== 'number') return false
  return dispatchCellSelection(editor, (doc) => CellSelection.rowSelection(doc.resolve(anchor)))
}

/**
 * Select an entire column by index (0-based) via CellSelection.colSelection.
 * `tablePos` (optional) targets a specific table (hover path).
 */
export function selectTableColumn(editor: Editor, colIndex: number, tablePos?: number): boolean {
  const geo = getTableGeometry(editor, tablePos)
  if (!geo) return false
  const anchor = geo.colAnchors[colIndex]
  if (typeof anchor !== 'number') return false
  return dispatchCellSelection(editor, (doc) => CellSelection.colSelection(doc.resolve(anchor)))
}

/** Shared: set a CellSelection via a focused, dispatched transaction. */
function dispatchCellSelection(
  editor: Editor,
  make: (doc: EditorState['doc']) => CellSelection,
): boolean {
  const { state, view } = editor
  try {
    const selection = make(state.doc)
    const tr = state.tr.setSelection(selection)
    view.dispatch(tr)
    // Keep the DOM focused so the following menu action operates on this table.
    view.focus()
    return true
  } catch {
    return false
  }
}

/**
 * Run a row/column/table menu action against the CURRENT selection. The overlay
 * calls `selectTableRow`/`selectTableColumn` first (grip click) so `selectedRect`
 * inside the Tiptap table commands targets exactly the picked row/column.
 *
 * Every branch is a single Tiptap command chain → one transaction → collab-safe.
 * Returns the command's own boolean (true if it applied).
 */
export function tableMenuAction(editor: Editor, action: TableMenuAction): boolean {
  const chain = editor.chain().focus()
  switch (action) {
    case 'insertRowAbove':
      return chain.addRowBefore().run()
    case 'insertRowBelow':
      return chain.addRowAfter().run()
    case 'deleteRow':
      return chain.deleteRow().run()
    case 'insertColumnLeft':
      return chain.addColumnBefore().run()
    case 'insertColumnRight':
      return chain.addColumnAfter().run()
    case 'deleteColumn':
      return chain.deleteColumn().run()
    case 'toggleHeaderRow':
      return chain.toggleHeaderRow().run()
    case 'toggleHeaderColumn':
      return chain.toggleHeaderColumn().run()
    case 'deleteTable':
      return chain.deleteTable().run()
    default:
      return false
  }
}
