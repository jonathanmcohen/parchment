/**
 * formula-cells.ts — B4 formula recompute command.
 *
 * `recomputeFormulas(editor)` walks the table that contains the current
 * selection, builds a numeric map of all cell values keyed by A1-style
 * references, evaluates every cell whose text starts with '=', and writes
 * the results back via a single ProseMirror transaction.
 *
 * Position-drift hazard: replacing a cell's content changes node sizes and
 * shifts every subsequent document position. We collect all replacements
 * first, then apply them in **descending pos order** so that a replacement
 * at position N never invalidates an earlier position that has already been
 * processed.
 */

import type { Editor } from '@tiptap/core'
import { cellRef } from '@/lib/editor/cell-refs'
import { evalFormula } from '@/lib/editor/formula'

interface CellInfo {
  /** Absolute document position of the cell open token */
  pos: number
  /** Total node size (open + content + close tokens) */
  nodeSize: number
  /** Plain-text content */
  text: string
  rowIndex: number
  colIndex: number
  // biome-ignore lint/suspicious/noExplicitAny: ProseMirror node
  node: any
}

/**
 * Recompute all formula cells (cells whose trimmed text starts with '=')
 * inside the table that contains the current editor selection.
 *
 * Safe to call when the selection is outside a table — returns early
 * without dispatching a transaction.
 */
export function recomputeFormulas(editor: Editor): void {
  const { state, view } = editor
  const { doc, tr, schema } = state

  // ── 1. Find the table node ────────────────────────────────────────────
  // biome-ignore lint/suspicious/noExplicitAny: ProseMirror node
  let tableNode: any = null
  let tablePos = -1

  doc.descendants((node, pos) => {
    if (node.type.name === 'table' && tableNode === null) {
      tableNode = node
      tablePos = pos
      return false
    }
    return true
  })

  if (!tableNode || tablePos < 0) return

  // ── 2. Walk rows and cells, recording absolute positions ─────────────
  const cellInfos: CellInfo[] = []
  const tableContentOffset = tablePos + 1 // skip the table open token
  let rowIndex = 0

  // biome-ignore lint/suspicious/noExplicitAny: ProseMirror node
  tableNode.forEach((rowNode: any, rowOffset: number) => {
    // rowOffset is relative to the table content start
    const rowPos = tableContentOffset + rowOffset
    const cellStartOffset = rowPos + 1 // skip the row open token

    let colIndex = 0
    let accumulated = 0

    // biome-ignore lint/suspicious/noExplicitAny: ProseMirror node
    rowNode.content.content.forEach((cellNode: any) => {
      cellInfos.push({
        pos: cellStartOffset + accumulated,
        nodeSize: cellNode.nodeSize as number,
        text: cellNode.textContent as string,
        rowIndex,
        colIndex,
        node: cellNode,
      })
      accumulated += cellNode.nodeSize as number
      colIndex++
    })

    rowIndex++
  })

  if (cellInfos.length === 0) return

  // ── 3. Build numeric value map: A1 ref → number ───────────────────────
  // Header row IS included (row 0 = top row = '1' in A1 notation).
  const valueMap = new Map<string, number>()
  for (const ci of cellInfos) {
    const trimmed = ci.text.trim()
    const n = Number(trimmed)
    if (trimmed !== '' && Number.isFinite(n)) {
      valueMap.set(cellRef(ci.rowIndex, ci.colIndex), n)
    }
  }

  // ── 4. Collect replacements for formula cells ─────────────────────────
  const paraType = schema.nodes.paragraph
  if (!paraType) return

  type Replacement = {
    from: number
    to: number
    // biome-ignore lint/suspicious/noExplicitAny: ProseMirror node
    newNode: any
  }

  const replacements: Replacement[] = []

  for (const ci of cellInfos) {
    if (!ci.text.trimStart().startsWith('=')) continue

    const result = evalFormula(ci.text.trim(), valueMap)
    const displayText = typeof result === 'number' ? String(result) : '#ERR'

    const paraNode = paraType.create(null, displayText ? schema.text(displayText) : undefined)

    // Preserve the cell's node type (tableCell or tableHeader) and existing
    // attrs; additionally set the 'formula' attr so it round-trips as
    // data-formula in the HTML.
    const newAttrs = {
      ...(ci.node.attrs as Record<string, unknown>),
      formula: ci.text.trim(),
    }
    // biome-ignore lint/suspicious/noExplicitAny: ProseMirror node type
    const newCellNode = (ci.node.type as any).create(newAttrs, paraNode, ci.node.marks)

    replacements.push({ from: ci.pos, to: ci.pos + ci.nodeSize, newNode: newCellNode })
  }

  if (replacements.length === 0) return

  // ── 5. Apply in descending position order to avoid drift ─────────────
  // Replacing a cell at position N shrinks/grows the document from N onward.
  // Processing highest positions first ensures earlier positions stay valid.
  replacements.sort((a, b) => b.from - a.from)

  const transaction = tr
  for (const { from, to, newNode } of replacements) {
    transaction.replaceWith(from, to, newNode)
  }

  view.dispatch(transaction)
}
