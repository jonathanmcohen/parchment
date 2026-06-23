// K7 (pure): custom-dictionary helpers shared by the server (dictionary-repo,
// the grammar route) and unit tests. NO 'server-only', NO @/db, NO editor/DOM
// import — pure string logic so it is safe to import anywhere and is unit-tested
// in isolation (mirrors the cairn.ts server-runtime-safe constraint).
//
// A custom dictionary is a list of words the user has marked as correct. A
// LanguageTool match flagging one of those words must be suppressed before the
// matches reach the client (filterMatchesByDict). Browser-native spellcheck
// squiggles CANNOT be suppressed this way — that is an OS/browser behavior the
// app does not control; the custom dictionary only affects LanguageTool matches.

/** A single LanguageTool match, mapped to our own shape (see languagetool.ts). */
export interface Match {
  /** 0-based character offset of the flagged span in the checked text. */
  offset: number
  /** Length (in characters) of the flagged span. */
  length: number
  /** Human-facing description of the issue (rendered as ESCAPED text — no HTML). */
  message: string
  /** Suggested replacements (already capped + coerced to strings). */
  replacements: string[]
  /** The originating rule — id + category for grouping/telemetry. */
  rule: { id: string; category: string }
}

/** Max stored dictionary words per owner — bounds storage + filter cost. */
export const MAX_DICT_WORDS = 2000
/** Max length of a single normalized dictionary word. */
export const MAX_WORD_LEN = 64

/**
 * Normalize a word to its canonical dictionary form: trim surrounding
 * whitespace, collapse to lower-case, and cap the length. Returns '' for a
 * non-string or whitespace-only input (the caller drops empties). Case folding
 * makes the dictionary case-insensitive: adding "Acme" suppresses "acme",
 * "ACME", etc.
 */
export function normalizeWord(w: unknown): string {
  if (typeof w !== 'string') return ''
  return w.trim().toLowerCase().slice(0, MAX_WORD_LEN)
}

/**
 * Normalize + dedupe a list of words, dropping empties, preserving first-seen
 * order, and capping the list at MAX_DICT_WORDS. Used when reading/writing the
 * dictionary so the stored value is always canonical.
 */
export function normalizeDict(words: unknown): string[] {
  if (!Array.isArray(words)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of words) {
    const w = normalizeWord(raw)
    if (w === '' || seen.has(w)) continue
    seen.add(w)
    out.push(w)
    if (out.length >= MAX_DICT_WORDS) break
  }
  return out
}

/**
 * Drop every match whose flagged substring is present in the custom dictionary.
 *
 * The flagged substring is `text.slice(offset, offset + length)`, compared
 * case-insensitively (via normalizeWord) against the normalized dictionary set.
 * A match with an out-of-range / empty span, or whose flagged text normalizes to
 * '', is KEPT (we only drop a match when we positively recognize a dict word) —
 * we never silently swallow a real grammar issue. PURE: no mutation of inputs.
 */
export function filterMatchesByDict(
  matches: readonly Match[],
  text: string,
  dict: readonly string[],
): Match[] {
  if (!Array.isArray(matches) || matches.length === 0) return []
  const dictSet = new Set(normalizeDict(dict as unknown[]))
  if (dictSet.size === 0) return matches.slice()

  const out: Match[] = []
  for (const m of matches) {
    const start = m.offset
    const end = m.offset + m.length
    // Defensive bounds check: a malformed/out-of-range span is never treated as
    // a dictionary hit (it is kept so the issue still surfaces).
    if (
      typeof start !== 'number' ||
      typeof m.length !== 'number' ||
      start < 0 ||
      m.length <= 0 ||
      end > text.length
    ) {
      out.push(m)
      continue
    }
    const flagged = normalizeWord(text.slice(start, end))
    if (flagged !== '' && dictSet.has(flagged)) continue // suppressed by dict
    out.push(m)
  }
  return out
}
