// G3: workspace theme — a pure (no db / no React) module describing the
// accent color + font pair applied site-wide. The stored value lives under the
// `workspaceTheme` settings key; the app layout reads it and injects the CSS
// custom properties produced by `themeCssVars`.
//
// I1: extended with colorScheme (light | dark | system) + pageBg (#hex or keyword).

/** A workspace theme: an accent color (#hex) + a key into {@link FONT_PAIRS}. */
export interface WorkspaceTheme {
  accent: string
  /** A key into {@link FONT_PAIRS}. */
  fontPair: string
  /** I1: Color scheme preference. */
  colorScheme: 'light' | 'dark' | 'system'
  /** I1: Page/paper background — a #hex or one of the {@link PAGE_BG_PRESETS} keywords. */
  pageBg: string
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

/**
 * I1: Eight accent preset swatches (violet/purple/blue/teal/green/amber/rose/slate).
 * The first entry matches the DEFAULT_THEME accent.
 */
export const ACCENT_SWATCHES: readonly string[] = [
  '#6d28d9', // violet (default)
  '#7c3aed', // purple
  '#2563eb', // blue
  '#0891b2', // teal
  '#16a34a', // green
  '#d97706', // amber
  '#e11d48', // rose
  '#475569', // slate
]

/**
 * I1: Named page-background presets.
 * The value is stored as-is in the theme; the CSS consumer converts it to a colour.
 */
export const PAGE_BG_PRESETS: readonly { key: string; label: string; value: string }[] = [
  { key: 'white', label: 'White', value: 'white' },
  { key: 'sepia', label: 'Sepia', value: 'sepia' },
]

const COLOR_SCHEMES = ['light', 'dark', 'system'] as const

/** The default theme used when nothing is stored or a value is malformed. */
export const DEFAULT_THEME: WorkspaceTheme = {
  accent: '#6d28d9',
  fontPair: 'system',
  colorScheme: 'system',
  pageBg: 'white',
}

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
 *
 * Legacy compat: a stored value that lacks `colorScheme` or `pageBg` defaults
 * to `'system'` and `'white'` respectively — never breaks.
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

  // I1: colorScheme — unknown value → default 'system'.
  const colorScheme =
    typeof obj.colorScheme === 'string' &&
    (COLOR_SCHEMES as readonly string[]).includes(obj.colorScheme)
      ? (obj.colorScheme as WorkspaceTheme['colorScheme'])
      : DEFAULT_THEME.colorScheme

  // I1: pageBg — accepts a keyword ('white' | 'sepia') or a #hex string.
  const pageBg = (() => {
    const raw = obj.pageBg
    if (typeof raw !== 'string') return DEFAULT_THEME.pageBg
    if (PAGE_BG_PRESETS.some((p) => p.value === raw)) return raw
    if (HEX_RE.test(raw)) return raw
    return DEFAULT_THEME.pageBg
  })()

  return { accent, fontPair, colorScheme, pageBg }
}

/** Resolve a pageBg value to the CSS color it represents. */
function resolvePageBg(pageBg: string): string {
  if (pageBg === 'white') return '#ffffff'
  if (pageBg === 'sepia') return '#f5efe0'
  // Already a hex color.
  return pageBg
}

/**
 * The CSS custom-property map a theme produces. These override the globals.css
 * defaults when applied to a wrapping element.
 *
 * I1: also emits `--page-bg` from the pageBg field.
 */
export function themeCssVars(theme: WorkspaceTheme): Record<string, string> {
  const pair = findPair(theme.fontPair)
  return {
    // Both accent tokens track the picker: `--accent-contrast` drives buttons,
    // focus rings and primary fills, while the bare `--accent` recolors links,
    // selections, code-block highlights and the many color-mix accent surfaces.
    // Emitting only one leaves a large share of the accent UI on the default.
    '--accent': theme.accent,
    '--accent-contrast': theme.accent,
    '--font-heading': pair.heading,
    '--font-body': pair.body,
    // I1: page/paper background, overrides --paper on the doc canvas.
    '--page-bg': resolvePageBg(theme.pageBg),
  }
}
