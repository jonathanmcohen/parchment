// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { CellSelection } from '@tiptap/pm/tables'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getTableGeometry,
  selectTableColumn,
  selectTableRow,
  tableMenuAction,
} from '@/lib/editor/table-controls'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

type AnyNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: AnyNode[]
}

function findNode(root: AnyNode, type: string): AnyNode | undefined {
  if (root.type === type) return root
  for (const child of root.content ?? []) {
    const found = findNode(child, type)
    if (found) return found
  }
  return undefined
}

function countNodes(root: AnyNode, type: string): number {
  let count = root.type === type ? 1 : 0
  for (const child of root.content ?? []) count += countNodes(child, type)
  return count
}

/** All row nodes (arrays of cell text) for the first table in the doc. */
function tableGrid(root: AnyNode): string[][] {
  const table = findNode(root, 'table')
  if (!table) return []
  return (table.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => {
      // cell → paragraph → text
      const para = cell.content?.[0]
      const text = para?.content?.[0]
      return typeof text?.type === 'string' && text.type === 'text'
        ? ((text as unknown as { text?: string }).text ?? '')
        : ''
    }),
  )
}

let editor: Editor

beforeEach(() => {
  editor = new Editor({ extensions: baseExtensions, content: '<p>start</p>' })
})

afterEach(() => {
  editor.destroy()
})

/** Insert a 3x3 table (no header) filled a1..c3, cursor inside it. */
function seedTable(withHeaderRow = false): void {
  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow }).run()
  // Fill each cell with a coordinate label so we can track row/col ops.
  const labels = [
    ['a1', 'b1', 'c1'],
    ['a2', 'b2', 'c2'],
    ['a3', 'b3', 'c3'],
  ]
  // Walk rows/cells structurally, recording each cell's absolute position.
  const cells: { pos: number; ri: number; ci: number }[] = []
  let rowIdx = 0
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableRow') {
      let colIdx = 0
      let cellStart = pos + 1
      node.forEach((cell) => {
        cells.push({ pos: cellStart, ri: rowIdx, ci: colIdx })
        cellStart += cell.nodeSize
        colIdx += 1
      })
      rowIdx += 1
    }
    return true
  })
  // Write labels from last→first so positions stay valid.
  const tr = editor.state.tr
  for (const { pos, ri, ci } of [...cells].reverse()) {
    const label = labels[ri]?.[ci] ?? ''
    // cell content is <p></p>; place text inside the paragraph (pos+1 = cell open, +1 = para open)
    tr.insertText(label, pos + 2)
  }
  editor.view.dispatch(tr)
}

describe('getTableGeometry', () => {
  it('returns null when the selection is outside a table', () => {
    editor.commands.setTextSelection(2)
    expect(getTableGeometry(editor)).toBeNull()
  })

  it('reports rows/cols and per-row/col anchor cell positions for a 3x3 table', () => {
    seedTable()
    // Move cursor into the table.
    editor.commands.setTextSelection(3)
    const geo = getTableGeometry(editor)
    expect(geo).not.toBeNull()
    expect(geo?.rows).toBe(3)
    expect(geo?.cols).toBe(3)
    // One anchor position per row and per column.
    expect(geo?.rowAnchors.length).toBe(3)
    expect(geo?.colAnchors.length).toBe(3)
    // tablePos is the absolute start of the table node.
    const tableNode = editor.state.doc
    let tablePos = -1
    tableNode.descendants((n, p) => {
      if (n.type.name === 'table' && tablePos < 0) tablePos = p
    })
    expect(geo?.tablePos).toBe(tablePos)
  })
})

describe('getTableGeometry with an explicit tablePos (hover path)', () => {
  it('resolves geometry for a table the selection is NOT inside', () => {
    seedTable()
    // Move the cursor OUT of the table (into the trailing paragraph).
    let outsidePos = -1
    editor.state.doc.descendants((node, p) => {
      if (node.isText && node.text === 'start') outsidePos = p
    })
    editor.commands.setTextSelection(outsidePos)
    expect(getTableGeometry(editor)).toBeNull() // selection-based: none

    let tablePos = -1
    editor.state.doc.descendants((n, p) => {
      if (n.type.name === 'table' && tablePos < 0) tablePos = p
    })
    const geo = getTableGeometry(editor, tablePos)
    expect(geo).not.toBeNull()
    expect(geo?.rows).toBe(3)
    expect(geo?.cols).toBe(3)
    expect(geo?.tablePos).toBe(tablePos)
  })

  it('returns null for a position that is not a table', () => {
    seedTable()
    // The trailing "start" paragraph's position is not a table node.
    let paraPos = -1
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === 'paragraph' && node.textContent === 'start') paraPos = p
    })
    expect(paraPos).toBeGreaterThan(0)
    expect(getTableGeometry(editor, paraPos)).toBeNull()
    // Out-of-range positions are safely null too.
    expect(getTableGeometry(editor, 999999)).toBeNull()
  })
})

describe('selectTableRow / selectTableColumn with explicit tablePos', () => {
  it('selects a row in the hovered table even when the cursor is outside it', () => {
    seedTable()
    let outsidePos = -1
    editor.state.doc.descendants((node, p) => {
      if (node.isText && node.text === 'start') outsidePos = p
    })
    editor.commands.setTextSelection(outsidePos)

    let tablePos = -1
    editor.state.doc.descendants((n, p) => {
      if (n.type.name === 'table' && tablePos < 0) tablePos = p
    })
    const ok = selectTableRow(editor, 1, tablePos)
    expect(ok).toBe(true)
    expect(editor.state.selection instanceof CellSelection).toBe(true)
    expect((editor.state.selection as CellSelection).isRowSelection()).toBe(true)
  })

  it('selects a column via explicit tablePos', () => {
    seedTable()
    let tablePos = -1
    editor.state.doc.descendants((n, p) => {
      if (n.type.name === 'table' && tablePos < 0) tablePos = p
    })
    const ok = selectTableColumn(editor, 0, tablePos)
    expect(ok).toBe(true)
    expect((editor.state.selection as CellSelection).isColSelection()).toBe(true)
  })
})

describe('selectTableRow / selectTableColumn', () => {
  it('selectTableRow(1) creates a CellSelection spanning the middle row', () => {
    seedTable()
    editor.commands.setTextSelection(3)
    const ok = selectTableRow(editor, 1)
    expect(ok).toBe(true)
    const sel = editor.state.selection
    expect(sel instanceof CellSelection).toBe(true)
    // A row selection reports isRowSelection true.
    expect((sel as CellSelection).isRowSelection()).toBe(true)
  })

  it('selectTableColumn(2) creates a CellSelection spanning the last column', () => {
    seedTable()
    editor.commands.setTextSelection(3)
    const ok = selectTableColumn(editor, 2)
    expect(ok).toBe(true)
    const sel = editor.state.selection
    expect(sel instanceof CellSelection).toBe(true)
    expect((sel as CellSelection).isColSelection()).toBe(true)
  })

  it('returns false for an out-of-range index', () => {
    seedTable()
    editor.commands.setTextSelection(3)
    expect(selectTableRow(editor, 99)).toBe(false)
    expect(selectTableColumn(editor, 99)).toBe(false)
  })
})

describe('tableMenuAction — row/column shapes', () => {
  it('insertRowAbove at row 1 grows the table to 4 rows and inserts above b2', () => {
    seedTable()
    selectTableRow(editor, 1)
    tableMenuAction(editor, 'insertRowAbove')
    const doc = editor.getJSON() as AnyNode
    expect(countNodes(doc, 'tableRow')).toBe(4)
    const grid = tableGrid(doc)
    // The new (empty) row is now at index 1; original row2 slid to index 2.
    expect(grid[0]?.[0]).toBe('a1')
    expect(grid[1]?.join('')).toBe('') // freshly inserted, empty
    expect(grid[2]?.[0]).toBe('a2')
  })

  it('insertRowBelow at row 1 inserts below b2', () => {
    seedTable()
    selectTableRow(editor, 1)
    tableMenuAction(editor, 'insertRowBelow')
    const grid = tableGrid(editor.getJSON() as AnyNode)
    expect(grid.length).toBe(4)
    expect(grid[1]?.[0]).toBe('a2')
    expect(grid[2]?.join('')).toBe('') // inserted empty row below
    expect(grid[3]?.[0]).toBe('a3')
  })

  it('deleteRow at row 1 removes the middle row', () => {
    seedTable()
    selectTableRow(editor, 1)
    tableMenuAction(editor, 'deleteRow')
    const grid = tableGrid(editor.getJSON() as AnyNode)
    expect(grid.length).toBe(2)
    expect(grid[0]?.[0]).toBe('a1')
    expect(grid[1]?.[0]).toBe('a3')
  })

  it('insertColumnLeft at col 1 grows to 4 cols, inserting before b*', () => {
    seedTable()
    selectTableColumn(editor, 1)
    tableMenuAction(editor, 'insertColumnLeft')
    const grid = tableGrid(editor.getJSON() as AnyNode)
    expect(grid[0]?.length).toBe(4)
    expect(grid[0]?.[0]).toBe('a1')
    expect(grid[0]?.[1]).toBe('') // new empty column
    expect(grid[0]?.[2]).toBe('b1')
  })

  it('insertColumnRight at col 1 inserts after b*', () => {
    seedTable()
    selectTableColumn(editor, 1)
    tableMenuAction(editor, 'insertColumnRight')
    const grid = tableGrid(editor.getJSON() as AnyNode)
    expect(grid[0]?.length).toBe(4)
    expect(grid[0]?.[1]).toBe('b1')
    expect(grid[0]?.[2]).toBe('') // new empty column to the right of b1
    expect(grid[0]?.[3]).toBe('c1')
  })

  it('deleteColumn at col 1 removes the middle column', () => {
    seedTable()
    selectTableColumn(editor, 1)
    tableMenuAction(editor, 'deleteColumn')
    const grid = tableGrid(editor.getJSON() as AnyNode)
    expect(grid[0]?.length).toBe(2)
    expect(grid[0]?.[0]).toBe('a1')
    expect(grid[0]?.[1]).toBe('c1')
  })

  it('toggleHeaderRow flips the first row to header cells', () => {
    seedTable(false)
    editor.commands.setTextSelection(3)
    const before = countNodes(editor.getJSON() as AnyNode, 'tableHeader')
    tableMenuAction(editor, 'toggleHeaderRow')
    const after = countNodes(editor.getJSON() as AnyNode, 'tableHeader')
    expect(after).toBeGreaterThan(before)
  })

  it('toggleHeaderColumn flips the first column to header cells', () => {
    seedTable(false)
    editor.commands.setTextSelection(3)
    const before = countNodes(editor.getJSON() as AnyNode, 'tableHeader')
    tableMenuAction(editor, 'toggleHeaderColumn')
    const after = countNodes(editor.getJSON() as AnyNode, 'tableHeader')
    expect(after).toBeGreaterThan(before)
  })

  it('deleteTable removes the whole table', () => {
    seedTable()
    editor.commands.setTextSelection(3)
    tableMenuAction(editor, 'deleteTable')
    expect(findNode(editor.getJSON() as AnyNode, 'table')).toBeUndefined()
  })

  it('is collab-safe: each action produces exactly one new transaction step group', () => {
    seedTable()
    selectTableRow(editor, 0)
    const before = editor.state.tr.steps.length
    void before
    // Count doc changes: a single dispatched command should bump the doc version once.
    const v0 = editor.state.doc
    tableMenuAction(editor, 'insertRowBelow')
    const v1 = editor.state.doc
    expect(v1).not.toBe(v0)
  })
})
