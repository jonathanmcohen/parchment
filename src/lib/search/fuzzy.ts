/**
 * Fuzzy matching utilities for the ⌘P file finder.
 *
 * Scoring strategy (higher = better):
 *   - Base: each matched character contributes +1
 *   - Consecutive run bonus: +2 per character that continues a run from the
 *     previous matched position (encourages "abc" to prefer "abc" over "aXbXc")
 *   - Word-start bonus: +3 when a matched character begins a word — i.e., it
 *     follows a space, hyphen, underscore, slash, dot, or is the very first char
 *   - Earlier-start penalty: −0.01 × firstMatchIndex (marginal preference for
 *     matches that start near the beginning of the string)
 */

const SEPARATORS = new Set([' ', '-', '_', '/', '.', '(', ')'])

/**
 * fzf-style subsequence score. Returns null if `query`'s chars don't all appear
 * in order in `text`; otherwise a number where HIGHER = better. Case-insensitive.
 * Reward: consecutive matches, matches at word starts / after separators, and an
 * earlier first-match position. Empty query → 0 (matches everything, neutral).
 */
export function fuzzyScore(query: string, text: string): number | null {
  if (query.length === 0) return 0

  const q = query.toLowerCase()
  const t = text.toLowerCase()

  let score = 0
  let qi = 0 // position in query
  let firstMatch = -1
  let prevTi = -1 // previous matched position in text

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue

    // Matched a character
    if (firstMatch === -1) firstMatch = ti
    qi++

    score += 1 // base per matched char

    // Consecutive run bonus
    if (prevTi !== -1 && ti === prevTi + 1) {
      score += 2
    }

    // Word-start bonus: first char of text, or previous char is a separator
    if (ti === 0 || SEPARATORS.has(t[ti - 1] ?? '')) {
      score += 3
    }

    prevTi = ti
  }

  // All query chars must have been consumed
  if (qi < q.length) return null

  // Earlier-start penalty (marginal)
  score -= (firstMatch === -1 ? 0 : firstMatch) * 0.01

  return score
}

/**
 * Filter+rank items by fuzzy-matching `key(item)`. Returns matches only, best first.
 * Stable for equal scores. Empty query → all items in original order.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  key: (item: T) => string,
  limit = 50,
): T[] {
  if (query.length === 0) {
    return limit < items.length ? items.slice(0, limit) : items.slice()
  }

  type Scored = { item: T; score: number; idx: number }
  const scored: Scored[] = []

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    if (item === undefined) continue
    const score = fuzzyScore(query, key(item))
    if (score !== null) {
      scored.push({ item, score, idx })
    }
  }

  // Sort descending by score; stable-sort by original index for equal scores
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx)

  const out: T[] = []
  for (let i = 0; i < Math.min(scored.length, limit); i++) {
    const entry = scored[i]
    if (entry !== undefined) out.push(entry.item)
  }
  return out
}
