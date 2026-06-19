/**
 * Pure helpers for code-block C5/C6/C7 features.
 *
 * - parseLineRanges: parse a highlight-lines spec into a Set of line numbers.
 * - diffLineKind: classify a diff line as 'add', 'del', or null.
 *
 * No browser / ProseMirror deps — safe to import in unit tests.
 */

// ── parseLineRanges ─────────────────────────────────────────────────────────

/**
 * Parse a highlight-lines spec like '1,3-5' or '{1, 3-5}' into a Set of
 * 1-based line numbers. Strips surrounding braces and spaces. Ignores invalid
 * tokens (non-numeric, reverse ranges). Returns an empty Set for empty input.
 *
 * Examples:
 *   '1,3-5'   → Set{1,3,4,5}
 *   '{2-4}'   → Set{2,3,4}
 *   ''        → Set{}
 *   'x,2'     → Set{2}
 */
export function parseLineRanges(spec: string): Set<number> {
  const result = new Set<number>()
  // Strip surrounding braces and whitespace.
  const cleaned = spec.replace(/^\{|\}$/g, '').trim()
  if (!cleaned) return result

  const tokens = cleaned.split(',')
  for (const token of tokens) {
    const trimmed = token.trim()
    if (!trimmed) continue

    if (trimmed.includes('-')) {
      const dashIdx = trimmed.indexOf('-')
      const startStr = trimmed.slice(0, dashIdx).trim()
      const endStr = trimmed.slice(dashIdx + 1).trim()
      const start = Number.parseInt(startStr, 10)
      const end = Number.parseInt(endStr, 10)
      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) {
          result.add(i)
        }
      }
    } else {
      const n = Number.parseInt(trimmed, 10)
      if (!Number.isNaN(n)) {
        result.add(n)
      }
    }
  }

  return result
}

// ── diffLineKind ────────────────────────────────────────────────────────────

export type DiffKind = 'add' | 'del' | null

/**
 * Classify a diff line as 'add', 'del', or null (context/other).
 *
 * - '+' prefix (but not '+++') → 'add'
 * - '-' prefix (but not '---') → 'del'
 * - anything else → null
 */
export function diffLineKind(line: string): DiffKind {
  if (line.startsWith('+++') || line.startsWith('---')) return null
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return null
}
