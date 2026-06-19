/**
 * Tiptap table extensions for Parchment B4.
 *
 * Provides: Table (with column resize), TableRow, TableCell, TableHeader.
 *
 * Formula cells (v0.1 approach — "store-and-compute"):
 *   A custom `formula` attribute is added to TableCell via `addAttributes`.
 *   When a user types `=SUM(A1:A3)` into a cell and runs the `setCellFormula`
 *   command, the formula is stored in the `data-formula` HTML attribute, and
 *   the computed result is written immediately as the cell's text content.
 *   The TableControls component can trigger a "recompute" that reads sibling
 *   cell numeric values, builds a Map<string,number>, calls evalFormula, and
 *   replaces the cell text via a transaction.
 *
 *   This keeps the schema simple (no NodeView complexity) and ensures the
 *   formula is always visible in the persisted JSON/HTML.
 */

import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'

/**
 * TableCell extended with a `formula` attribute that round-trips through
 * `data-formula` on the rendered `<td>`.
 */
const TableCellWithFormula = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      formula: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-formula') ?? null,
        renderHTML: (attributes) => {
          if (!attributes.formula) return {}
          return { 'data-formula': attributes.formula as string }
        },
      },
    }
  },
})

export const tableExtensions = [
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCellWithFormula,
]
