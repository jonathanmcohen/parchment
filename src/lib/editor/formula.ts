/**
 * Pure formula evaluation engine for table cells (B4).
 *
 * Design: `cells` holds already-resolved numeric values keyed by cell ref
 * (e.g. 'A1'). Because cells contains numbers only — not formula strings —
 * true circular references cannot occur at this layer. The formula approach
 * for v0.1 is "store-and-compute": when a user types =SUM(...) into a cell,
 * the command `setCellFormula` stores the raw formula in the `formula` data-
 * attribute and immediately writes the computed numeric value as the cell's
 * display text. A NodeView / recompute pass reads sibling cell text, builds
 * the Map<string, number>, and calls evalFormula to refresh.
 *
 * Range expansion cap: to avoid hanging on huge ranges like A1:A1000000,
 * expansion is capped at MAX_RANGE_SIZE (10 000) cells.
 */

export type CellRef = string // e.g. 'A1'
export type FormulaResult = number | { error: string }

/** Maximum cells expanded from a single range (guards against huge ranges). */
const MAX_RANGE_SIZE = 10_000

/**
 * Expand a range like 'A1:A3' → ['A1','A2','A3']
 * or 'A1:B2' → ['A1','B1','A2','B2'].
 * Iterates rows first, columns within each row.
 * Capped at MAX_RANGE_SIZE.
 */
export function expandRange(range: string): CellRef[] {
  const parts = range.split(':')
  if (parts.length !== 2) return []

  const [startRef, endRef] = parts as [string, string]
  const startCol = startRef.replace(/\d+$/, '')
  const startRow = Number.parseInt(startRef.replace(/^[A-Za-z]+/, ''), 10)
  const endCol = endRef.replace(/\d+$/, '')
  const endRow = Number.parseInt(endRef.replace(/^[A-Za-z]+/, ''), 10)

  if (Number.isNaN(startRow) || Number.isNaN(endRow)) return []

  const startColIdx = colToIndex(startCol)
  const endColIdx = colToIndex(endCol)

  const refs: CellRef[] = []
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startColIdx; c <= endColIdx; c++) {
      refs.push(`${indexToCol(c)}${r}`)
      if (refs.length >= MAX_RANGE_SIZE) return refs
    }
  }
  return refs
}

/** Convert column letter(s) to 0-based index: A→0, B→1, Z→25, AA→26 */
function colToIndex(col: string): number {
  let idx = 0
  for (const ch of col.toUpperCase()) {
    idx = idx * 26 + (ch.charCodeAt(0) - 64)
  }
  return idx - 1
}

/** Convert 0-based column index back to letter(s): 0→A, 25→Z, 26→AA */
function indexToCol(idx: number): string {
  let col = ''
  let n = idx + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    col = String.fromCharCode(65 + rem) + col
    n = Math.floor((n - 1) / 26)
  }
  return col
}

/**
 * Resolve a comma-separated list of refs and/or ranges into a flat list of
 * CellRefs.
 */
function resolveArgs(argsStr: string): CellRef[] {
  const parts = argsStr.split(',').map((s) => s.trim())
  const refs: CellRef[] = []
  for (const part of parts) {
    if (part.includes(':')) {
      refs.push(...expandRange(part))
    } else {
      refs.push(part)
    }
  }
  return refs
}

/**
 * Evaluate a spreadsheet-style formula expression against a map of resolved
 * cell values.
 *
 * Supported functions: SUM, AVG, AVERAGE, COUNT
 *
 * @param expr  - formula string, must start with '='
 * @param cells - map of CellRef → numeric value (non-present = blank)
 */
export function evalFormula(expr: string, cells: Map<string, number>): FormulaResult {
  if (!expr.startsWith('=')) {
    return { error: 'Not a formula: must start with =' }
  }

  const body = expr.slice(1).trim()
  const match = /^([A-Za-z]+)\((.+)\)$/.exec(body)
  if (!match) {
    return { error: `Cannot parse formula: ${body}` }
  }

  // match[1] and match[2] are guaranteed by the regex capture groups above
  const fn = (match[1] ?? '').toUpperCase()
  const argsStr = (match[2] ?? '').trim()
  const refs = resolveArgs(argsStr)

  switch (fn) {
    case 'SUM': {
      let sum = 0
      for (const ref of refs) {
        const v = cells.get(ref)
        if (v !== undefined) sum += v
      }
      return sum
    }

    case 'AVG':
    case 'AVERAGE': {
      const values: number[] = []
      for (const ref of refs) {
        const v = cells.get(ref)
        if (v !== undefined) values.push(v)
      }
      if (values.length === 0) return { error: 'AVG/AVERAGE of empty range' }
      return values.reduce((a, b) => a + b, 0) / values.length
    }

    case 'COUNT': {
      let count = 0
      for (const ref of refs) {
        if (cells.has(ref)) count++
      }
      return count
    }

    default:
      return { error: `Unknown function: ${fn}` }
  }
}
