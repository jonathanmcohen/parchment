/**
 * Pure table-sort utilities for B4.
 *
 * `sortRows` is the unit-tested pure function. `sortTableByColumn` is the
 * editor command that reads the current table's data rows (skipping a header
 * row when present), sorts them, and replaces the table rows via a Prosemirror
 * transaction.
 */

import type { Editor } from '@tiptap/core'

/**
 * Sort a 2-D string array by a column index.
 *
 * Comparison strategy:
 *  - If both cells parse as finite numbers, compare numerically.
 *  - Otherwise compare as strings (locale-insensitive, case-insensitive).
 *
 * Stable: rows with equal keys preserve their original relative order.
 * Does NOT mutate the input.
 */
export function sortRows(rows: string[][], col: number, dir: 'asc' | 'desc'): string[][] {
  const indexed = rows.map((row, i) => ({ row, i }))

  indexed.sort((a, b) => {
    const av = a.row[col] ?? ''
    const bv = b.row[col] ?? ''

    const an = Number(av)
    const bn = Number(bv)

    let cmp: number
    if (Number.isFinite(an) && Number.isFinite(bn)) {
      cmp = an - bn
    } else {
      cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' })
    }

    // Stable tiebreak: preserve original index order
    if (cmp === 0) cmp = a.i - b.i
    return dir === 'asc' ? cmp : -cmp
  })

  return indexed.map(({ row }) => row)
}

/**
 * Read the table around the current selection, sort data rows by the given
 * column, and replace them via a transaction.
 *
 * Header detection: if the first row consists exclusively of `tableHeader`
 * nodes it is skipped during sort and left in place.
 */
export function sortTableByColumn(
  editor: Editor,
  columnIndex: number,
  direction: 'asc' | 'desc',
): void {
  const { state, view } = editor
  const { doc, tr, schema } = state

  // Find the table node that contains the current selection
  let tablePos = -1
  let tableNode = null as typeof doc.nodeAt extends (pos: number) => infer R ? R : never

  doc.descendants((node, pos) => {
    if (node.type.name === 'table' && tableNode === null) {
      tableNode = node
      tablePos = pos
      return false
    }
    return true
  })

  if (!tableNode || tablePos < 0) return

  // biome-ignore lint/suspicious/noExplicitAny: ProseMirror node types
  const tNode = tableNode as any
  const rows: { node: typeof tNode; pos: number }[] = []
  const offset = tablePos + 1 // skip table open token

  tNode.forEach((rowNode: typeof tNode, rowOffset: number) => {
    rows.push({ node: rowNode, pos: offset + rowOffset })
  })

  if (rows.length === 0) return

  // Determine if first row is a header row (rows.length checked above)
  // biome-ignore lint/style/noNonNullAssertion: length guard ensures index 0 exists
  const firstRow = rows[0]!
  const firstRowIsHeader = firstRow.node.content.content.every(
    // biome-ignore lint/suspicious/noExplicitAny: ProseMirror node types
    (cell: any) => cell.type.name === 'tableHeader',
  )

  const dataRowsStartIdx = firstRowIsHeader ? 1 : 0
  const dataRows = rows.slice(dataRowsStartIdx)

  if (dataRows.length === 0) return

  // Extract text content per row/col
  const textGrid: string[][] = dataRows.map(({ node: rowNode }) => {
    const texts: string[] = []
    // biome-ignore lint/suspicious/noExplicitAny: ProseMirror node types
    rowNode.content.content.forEach((cell: any) => {
      texts.push(cell.textContent)
    })
    return texts
  })

  const sorted = sortRows(textGrid, columnIndex, direction)

  // Build new transaction: replace each data row's content
  const transaction = tr

  // We need to rebuild the row nodes in sorted order.
  // Walk sorted order, replace each data row node's cells with cells from
  // the sorted row (preserving cell node type).
  dataRows.forEach(({ node: origRowNode, pos: rowPos }, sortedIdx) => {
    // sorted has same length as dataRows — indexing is safe
    // biome-ignore lint/style/noNonNullAssertion: parallel array, same length
    const sortedTexts = sorted[sortedIdx]!

    let cellOffset = rowPos + 1 // skip row open token
    // biome-ignore lint/suspicious/noExplicitAny: ProseMirror node types
    origRowNode.content.content.forEach((cell: any, cellIdx: number) => {
      const newText = sortedTexts[cellIdx] ?? ''
      // Replace cell content with new text paragraph
      const paraType = schema.nodes.paragraph
      if (!paraType) return
      const paraNode = paraType.create(null, newText ? schema.text(newText) : undefined)
      const newCellNode = cell.type.create(cell.attrs, paraNode, cell.marks)
      transaction.replaceWith(cellOffset, cellOffset + cell.nodeSize, newCellNode)
      cellOffset += cell.nodeSize
    })
  })

  view.dispatch(transaction)
}
