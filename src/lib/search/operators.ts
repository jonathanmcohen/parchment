// Pure module — no db, no React, no DOM. Client- and server-safe.
//
// J6: structured search-operator parser. `parseQuery(raw)` pulls recognized
// operators (`tag:`, `folder:`, `is:starred`, `title:`, `before:`, `after:`,
// and `-tag:` negation) out of a free-text query and returns the remaining
// text plus a `QueryFilters` object. The route layer resolves names → ids and
// merges these into `SearchFilters`; everything FTS already understands
// (quoted phrases, `-word`, OR) is left untouched in `text` and handed to
// `websearch_to_tsquery`.
//
// Contract: NEVER throws. Unknown operators, malformed dates, and stray quoted
// phrases pass through verbatim as text so nothing silently disappears.

export interface QueryFilters {
  tagName?: string
  excludeTagName?: string
  folderName?: string
  starred?: boolean
  titleContains?: string
  before?: string
  after?: string
}

export interface ParsedQuery {
  text: string
  filters: QueryFilters
}

/** Operators that take a string value (resolved name-side by the route). */
const VALUE_KEYS = new Set(['tag', 'folder', 'title'])
/** Operators that take an ISO date value. */
const DATE_KEYS = new Set(['before', 'after'])

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** True only for a real calendar date in YYYY-MM-DD form (e.g. rejects 2026-13-40). */
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * Tokenize respecting double quotes so `title:"year end"` and a bare
 * `"exact phrase"` are each a single token. Unbalanced quotes degrade
 * gracefully (the run to end-of-string becomes one token).
 */
function tokenize(raw: string): string[] {
  const tokens: string[] = []
  // Match: an optional leading key (word:) then either a "quoted" value or a
  // run of non-space chars. Keeps the key glued to its quoted value.
  const re = /(?:[-]?[A-Za-z]+:)?"[^"]*"|\S+/g
  for (const m of raw.matchAll(re)) {
    tokens.push(m[0])
  }
  return tokens
}

/** Strip one layer of surrounding double quotes, if present. */
function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1)
  }
  return value
}

export function parseQuery(raw: string): ParsedQuery {
  const filters: QueryFilters = {}
  const textParts: string[] = []

  for (const token of tokenize(raw.trim())) {
    // Split on the FIRST colon only (values may contain colons inside quotes).
    const colon = token.indexOf(':')
    // A quote before the colon means the colon is inside a value, not a key sep.
    const quote = token.indexOf('"')
    const hasKey = colon > 0 && (quote === -1 || quote > colon)

    if (!hasKey) {
      if (token) textParts.push(token)
      continue
    }

    const rawKey = token.slice(0, colon)
    const negated = rawKey.startsWith('-')
    const key = (negated ? rawKey.slice(1) : rawKey).toLowerCase()
    const value = unquote(token.slice(colon + 1))

    if (key === 'is') {
      if (!negated && value.toLowerCase() === 'starred') {
        filters.starred = true
      } else {
        textParts.push(token) // is:other (or -is:…) is not an operator → text
      }
      continue
    }

    if (key === 'tag') {
      if (value.length === 0) {
        textParts.push(token)
      } else if (negated) {
        filters.excludeTagName = value
      } else {
        filters.tagName = value
      }
      continue
    }

    if (VALUE_KEYS.has(key) && !negated) {
      if (value.length === 0) {
        textParts.push(token)
      } else if (key === 'folder') {
        filters.folderName = value
      } else if (key === 'title') {
        filters.titleContains = value
      }
      continue
    }

    if (DATE_KEYS.has(key) && !negated) {
      if (isValidIsoDate(value)) {
        if (key === 'before') filters.before = value
        else filters.after = value
      } else {
        textParts.push(token) // malformed date → preserved as text, never dropped
      }
      continue
    }

    // Unknown operator (or a negated value-op we don't support) → plain text.
    textParts.push(token)
  }

  return { text: textParts.join(' '), filters }
}
