// G15: Reading mode — pure utility module (no React, no DOM).
// Provides types, defaults, a prefs parser, CSS class builder, and localStorage
// key builders for the reading mode overlay.

export interface ReadingPrefs {
  sepia: boolean
  serif: boolean
  wide: boolean
}

/** Default reading prefs — all modifiers off. */
export const DEFAULT_READING_PREFS: ReadingPrefs = {
  sepia: false,
  serif: false,
  wide: false,
}

/**
 * Validate and normalise an unknown value retrieved from localStorage.
 * Each flag is coerced to boolean; unknown shape falls back to defaults.
 */
export function parseReadingPrefs(raw: unknown): ReadingPrefs {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_READING_PREFS }
  }
  const obj = raw as Record<string, unknown>
  return {
    sepia: Boolean(obj.sepia),
    serif: Boolean(obj.serif),
    wide: Boolean(obj.wide),
  }
}

/**
 * Build the CSS class string for the reading scroll container.
 * Always includes the base class; modifier classes are appended per flag.
 *
 * "wide" means wide-margin mode: a NARROWER text column (wider margins).
 */
export function readingClassNames(prefs: ReadingPrefs): string {
  const classes = ['parchment-reading']
  if (prefs.sepia) classes.push('parchment-reading--sepia')
  if (prefs.serif) classes.push('parchment-reading--serif')
  if (prefs.wide) classes.push('parchment-reading--wide')
  return classes.join(' ')
}

/** localStorage key for global reading prefs (shared across all documents). */
export function readingPrefsKey(): string {
  return 'parchment:reading-prefs'
}

/** localStorage key for per-document reading bookmark (scroll position). */
export function readingBookmarkKey(docId: string): string {
  return `parchment:reading-bookmark:${docId}`
}
