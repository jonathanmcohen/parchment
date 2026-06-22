// G3: workspace theme — a pure (no db / no React) module describing the
// accent color + font pair applied site-wide. The stored value lives under the
// `workspaceTheme` settings key; the app layout reads it and injects the CSS
// custom properties produced by `themeCssVars`.

/** A workspace theme: an accent color (#hex) + a key into {@link FONT_PAIRS}. */
export interface WorkspaceTheme {
  accent: string
  /** A key into {@link FONT_PAIRS}. */
  fontPair: string
}

/** A selectable heading/body font pairing. */
export interface FontPair {
  key: string
  name: string
  heading: string
  body: string
}

// System font stacks reused across pairs.
const SYSTEM_SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
const SYSTEM_SERIF = 'Georgia, "Times New Roman", serif'
const SYSTEM_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** The selectable font pairings. Non-empty; each entry has a heading + body. */
export const FONT_PAIRS: readonly FontPair[] = [
  { key: 'system', name: 'System', heading: SYSTEM_SANS, body: SYSTEM_SANS },
  { key: 'serif', name: 'Serif', heading: SYSTEM_SERIF, body: SYSTEM_SERIF },
  { key: 'inter', name: 'Inter', heading: `Inter, ${SYSTEM_SANS}`, body: `Inter, ${SYSTEM_SANS}` },
  { key: 'mono', name: 'Mono', heading: SYSTEM_MONO, body: SYSTEM_MONO },
  {
    key: 'classic',
    name: 'Classic',
    heading: `Georgia, ${SYSTEM_SERIF}`,
    body: SYSTEM_SANS,
  },
]

/** The default theme used when nothing is stored or a value is malformed. */
export const DEFAULT_THEME: WorkspaceTheme = { accent: '#6d28d9', fontPair: 'system' }

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Look up a font pair by key (defaults to the first pair). */
function findPair(key: string): FontPair {
  // FONT_PAIRS is non-empty so the fallback is always defined.
  const fallback = FONT_PAIRS[0] as FontPair
  return FONT_PAIRS.find((p) => p.key === key) ?? fallback
}

/**
 * Validate/normalize a raw value to a {@link WorkspaceTheme}. The accent must be
 * a #hex string and the fontPair must be a known key; anything else falls back
 * to {@link DEFAULT_THEME}'s value for that field.
 */
export function parseTheme(raw: unknown): WorkspaceTheme {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_THEME }
  const obj = raw as Record<string, unknown>

  const accent =
    typeof obj.accent === 'string' && HEX_RE.test(obj.accent) ? obj.accent : DEFAULT_THEME.accent

  const fontPair =
    typeof obj.fontPair === 'string' && FONT_PAIRS.some((p) => p.key === obj.fontPair)
      ? obj.fontPair
      : DEFAULT_THEME.fontPair

  return { accent, fontPair }
}

/**
 * The CSS custom-property map a theme produces. These override the globals.css
 * defaults when applied to a wrapping element.
 */
export function themeCssVars(theme: WorkspaceTheme): Record<string, string> {
  const pair = findPair(theme.fontPair)
  return {
    '--accent-contrast': theme.accent,
    '--font-heading': pair.heading,
    '--font-body': pair.body,
  }
}
