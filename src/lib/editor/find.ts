// Pure, unit-tested find/replace logic.
// No Tiptap/ProseMirror imports — this module runs in Node test environments.

export interface FindOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
}

export interface Match {
  from: number // 0-based char offset (inclusive)
  to: number // 0-based char offset (exclusive)
}

export type FindResult = { ok: true; matches: Match[] } | { ok: false; error: string }

/**
 * Find all occurrences of `query` in `text` using the supplied options.
 * Returns { ok: true, matches } on success, { ok: false, error } for invalid regex.
 * Empty query always returns an empty match list.
 */
export function findMatches(text: string, query: string, opts?: FindOptions): FindResult {
  if (!query) return { ok: true, matches: [] }

  const caseSensitive = opts?.caseSensitive ?? false
  const wholeWord = opts?.wholeWord ?? false
  const isRegex = opts?.regex ?? false

  let pattern: string
  if (isRegex) {
    pattern = query
  } else {
    // Escape special regex metacharacters
    pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  if (wholeWord) {
    pattern = `\\b(?:${pattern})\\b`
  }

  let re: RegExp
  try {
    re = new RegExp(pattern, caseSensitive ? 'g' : 'gi')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }

  const matches: Match[] = []
  // Guard against zero-length matches looping forever
  let lastIndex = -1
  for (;;) {
    const m = re.exec(text)
    if (m === null) break
    if (m.index === lastIndex) {
      re.lastIndex++
      continue
    }
    lastIndex = m.index
    matches.push({ from: m.index, to: m.index + m[0].length })
  }

  return { ok: true, matches }
}

/**
 * Apply a list of replacements to `text`. Replacements are applied right-to-left
 * so that earlier offsets remain valid as the string is mutated.
 * Matches must be non-overlapping (as produced by findMatches).
 */
export function applyReplacements(text: string, matches: Match[], replacement: string): string {
  // Sort descending by `from` so we apply right-to-left
  const sorted = [...matches].sort((a, b) => b.from - a.from)
  let result = text
  for (const match of sorted) {
    result = result.slice(0, match.from) + replacement + result.slice(match.to)
  }
  return result
}
