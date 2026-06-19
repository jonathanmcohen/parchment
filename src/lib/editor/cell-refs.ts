/**
 * Spreadsheet-style cell reference helpers (B4).
 *
 * colLabel: converts a 0-based column index to A-Z, AA-AZ, ... notation.
 * cellRef:  converts (rowIndex0, colIndex0) to a cell reference like 'A1'.
 *
 * Row labels are 1-based (row 0 → row label '1').
 */

/**
 * Convert a 0-based column index to spreadsheet column letters.
 * 0 → 'A', 25 → 'Z', 26 → 'AA', 51 → 'AZ', 52 → 'BA'
 */
export function colLabel(index: number): string {
  let col = ''
  let n = index + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    col = String.fromCharCode(65 + rem) + col
    n = Math.floor((n - 1) / 26)
  }
  return col
}

/**
 * Build a cell reference string from 0-based row and column indices.
 * cellRef(0, 0) → 'A1', cellRef(2, 1) → 'B3'
 */
export function cellRef(rowIndex0: number, colIndex0: number): string {
  return `${colLabel(colIndex0)}${rowIndex0 + 1}`
}
