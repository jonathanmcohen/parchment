// G3: workspace theme — a pure (no db / no React) module describing the
// accent color + font pair applied site-wide. The stored value lives under the
// `workspaceTheme` settings key; the app layout reads it and injects the CSS
// custom properties produced by `themeCssVars`.
//
// I1: extended with colorScheme (light | dark | system) + pageBg (#hex or keyword).
// K2: extended with highContrast (WCAG-AAA palette) + dyslexicFont (OpenDyslexic).

/** A workspace theme: an accent color (#hex) + a key into {@link FONT_PAIRS}. */
export interface WorkspaceTheme {
  accent: string
  /** A key into {@link FONT_PAIRS}. */
  fontPair: string
  /** I1: Color scheme preference. */
  colorScheme: 'light' | 'dark' | 'system'
  /** I1: Page/paper background — a #hex or one of the {@link PAGE_BG_PRESETS} keywords. */
  pageBg: string
  /**
   * K2: High-contrast mode. When true the layout sets data-high-contrast="true"
   * on the theme wrapper, which globals.css uses to override the colour vars to a
   * maximum-contrast (WCAG-AAA) palette layered on the active light/dark scheme.
   */
  highContrast: boolean
  /**
   * K2: Dyslexia-friendly font. When true the layout sets data-font="dyslexic" on
   * the theme wrapper, switching the UI + document text to the bundled OpenDyslexic
   * typeface (globals.css @font-face), falling back to a system dyslexia-ish stack.
   */
  dyslexicFont: boolean
}

/** A selectable heading/body font pairing. */
export interface FontPair {
  key: string
  name: string
  heading: string
  body: string
}

// System font stacks reused across pairs.
// S4-1: retargeted to the Google-Docs face set — Roboto chrome / Arial body /
// Roboto Mono code (faces self-hosted by S1-8). Google Sans is listed first for
// users who have it locally and falls back to self-hosted Roboto. The document
// BODY default is Arial (Docs lists Arial first in the font dropdown); the chrome
// SANS is the Google/Roboto stack mirrored from --font-ui in tokens.css.
const SYSTEM_SANS =
  '"Google Sans", "Roboto", system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
const ARIAL_BODY = 'Arial, sans-serif'
const SYSTEM_SERIF = 'Georgia, "Times New Roman", serif'
const SYSTEM_MONO = '"Roboto Mono", "Menlo", monospace'

/** The selectable font pairings. Non-empty; each entry has a heading + body. */
// S4-1: dropped the `inter` pair (Inter is gone). The default `system` pair pairs
// a Roboto/Google-Sans heading with an Arial body — Google-Docs defaults.
export const FONT_PAIRS: readonly FontPair[] = [
  { key: 'system', name: 'System', heading: SYSTEM_SANS, body: ARIAL_BODY },
  { key: 'serif', name: 'Serif', heading: SYSTEM_SERIF, body: SYSTEM_SERIF },
  { key: 'mono', name: 'Mono', heading: SYSTEM_MONO, body: SYSTEM_MONO },
  {
    key: 'classic',
    name: 'Classic',
    heading: `Georgia, ${SYSTEM_SERIF}`,
    body: ARIAL_BODY,
  },
]

/**
 * I1: Eight accent preset swatches (violet/purple/blue/teal/green/amber/rose/slate).
 * The first entry matches the DEFAULT_THEME accent.
 */
export const ACCENT_SWATCHES: readonly string[] = [
  '#1a73e8', // google blue (default)
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
 *
 * #8 (v0.1.9): added a `dark` page — a self-hostable Google-Docs-style DARK sheet.
 * Unlike white/sepia (light sheets that stay light in every chrome scheme), the
 * dark page flips the in-page palette (ink, surfaces, borders, code) to a
 * legible light-on-dark set via {@link DARK_PAGE_VARS}. The `dark` keyword is a
 * sentinel — {@link resolvePageBg} maps it to the dark canvas colour.
 */
export const PAGE_BG_PRESETS: readonly { key: string; label: string; value: string }[] = [
  { key: 'white', label: 'White', value: 'white' },
  { key: 'sepia', label: 'Sepia', value: 'sepia' },
  { key: 'dark', label: 'Dark', value: 'dark' },
]

/**
 * #8 (v0.1.9): the dark document-page palette. These override the per-scheme
 * `--page-*` defaults from tokens.css when pageBg === 'dark', so EVERY in-page
 * element (prose ink, inline code, tables, TOC, blockquote, callouts) follows
 * the dark sheet regardless of the chrome colour scheme. AA-verified against the
 * #1e1f22 canvas: #e8eaed body ink 13.7:1; #9aa0a6 muted 6.2:1 (both ≥ AA 4.5:1).
 *
 * `--code-bg` flips dark here too so code blocks sit on a dark surface; the Shiki
 * plugin pairs that with the `github-dark` token theme (see code-block-shiki.ts)
 * so the syntax colours stay legible light-on-dark.
 */
export const DARK_PAGE_VARS: Readonly<Record<string, string>> = {
  '--page-ink': '#e8eaed',
  '--page-ink-muted': '#9aa0a6',
  '--page-surface-muted': '#2a2c30',
  '--page-border': '#3c4043',
  '--code-bg': '#1b1c1f',
}

/** The dark document-page canvas colour (the sheet itself). */
const DARK_PAGE_BG = '#1e1f22'

/** True when a stored pageBg value selects the dark document page. */
export function isDarkPage(pageBg: string): boolean {
  return pageBg === 'dark'
}

const COLOR_SCHEMES = ['light', 'dark', 'system'] as const

/** The default theme used when nothing is stored or a value is malformed. */
export const DEFAULT_THEME: WorkspaceTheme = {
  accent: '#1a73e8',
  fontPair: 'system',
  colorScheme: 'system',
  pageBg: 'white',
  // K2: accessibility toggles default off so existing/new workspaces are unchanged.
  highContrast: false,
  dyslexicFont: false,
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
 * to `'system'` and `'white'` respectively — never breaks. K2's `highContrast`
 * and `dyslexicFont` default to `false` when absent (so themes stored before K2
 * still parse) and coerce any non-boolean value to `false`.
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

  // K2: accessibility booleans — only a literal `true` enables them; anything
  // else (absent for legacy themes, null, a string, a number…) coerces to false.
  const highContrast = obj.highContrast === true
  const dyslexicFont = obj.dyslexicFont === true

  return { accent, fontPair, colorScheme, pageBg, highContrast, dyslexicFont }
}

/** Resolve a pageBg value to the CSS color it represents. */
export function resolvePageBg(pageBg: string): string {
  if (pageBg === 'white') return '#ffffff'
  if (pageBg === 'sepia') return '#f5efe0'
  // #8 (v0.1.9): the dark page sheet.
  if (pageBg === 'dark') return DARK_PAGE_BG
  // Already a hex color.
  return pageBg
}

/**
 * The CSS custom-property map a theme produces. These override the globals.css
 * defaults when applied to a wrapping element.
 *
 * I1: also emits `--page-bg` from the pageBg field.
 */
// K2: the OpenDyslexic font stack. When dyslexicFont is on it MUST be emitted
// here (inline on the wrapper), not only via the [data-font="dyslexic"] CSS
// rule: themeCssVars sets `--font-body` inline, and an inline custom property
// shadows any stylesheet override of the same property (the I1 inline-var
// lesson). So the CSS rule's `--font-body` override never reached the UI chrome;
// emitting the dyslexic stack here makes the inline var itself OpenDyslexic, and
// the [data-font="dyslexic"] rule's `font-family: var(--font-body)` then carries
// it to every descendant.
const DYSLEXIC_FONT_STACK = '"OpenDyslexic", "Comic Sans MS", "Trebuchet MS", Verdana, sans-serif'

export function themeCssVars(theme: WorkspaceTheme): Record<string, string> {
  const pair = findPair(theme.fontPair)
  // #8 (v0.1.9): when the dark page is selected, override the page-scoped vars
  // (ink / muted ink / table surfaces / borders / code-bg) so every in-page
  // element follows the dark sheet. White/sepia/custom-hex pages emit nothing
  // here, so their per-scheme tokens.css defaults apply UNCHANGED.
  const darkPageVars = isDarkPage(theme.pageBg) ? DARK_PAGE_VARS : {}
  return {
    // S1-1: both accent tokens track the per-workspace picker and drive
    // IN-DOCUMENT accent ONLY — never chrome. Chrome (primary buttons, active
    // nav/toolbar pills, selected rows, the Share button, focus rings) reads the
    // FIXED `--primary*` tokens from tokens.css, which the picker can never
    // repaint, so a non-default accent swatch keeps Google-Blue chrome. The bare
    // `--accent` recolors prose links/marks, selections and color-mix accent
    // surfaces; `--accent-contrast` is the readable text shown ON an `--accent`
    // fill (e.g. the version-history diff toggle, comments filter pill).
    '--accent': theme.accent,
    '--accent-contrast': theme.accent,
    '--font-heading': theme.dyslexicFont ? DYSLEXIC_FONT_STACK : pair.heading,
    '--font-body': theme.dyslexicFont ? DYSLEXIC_FONT_STACK : pair.body,
    // I1: page/paper background, overrides --paper on the doc canvas.
    '--page-bg': resolvePageBg(theme.pageBg),
    // #8 (v0.1.9): dark-page palette (spread last so it wins). Empty object for
    // every non-dark page → no override, light/sepia/custom behave EXACTLY as before.
    ...darkPageVars,
  }
}
