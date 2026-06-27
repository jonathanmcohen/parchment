// J12-1: per-document theme OVERRIDE. Pure (no db / no React). A per-doc theme is
// a small ALLOW-LISTED blob stored at documents.meta.theme that overrides a few
// page-scoped CSS token variables for that one document (page background, in-page
// accent). It is token-ONLY by construction — there is NO path for arbitrary CSS to
// reach the DOM through here (that is the separate sanitized custom-css channel).
// resolveDocThemeVars returns a `Record<string,string>` of `--token` → value, every
// value a validated hex/keyword that cannot contain a CSS break-out character.

import { DARK_PAGE_VARS, isDarkPage, PAGE_BG_PRESETS, resolvePageBg } from '@/lib/editor/theme'

/** A bundled per-doc page theme: a named preset → its token-var overrides. */
export interface DocThemePreset {
  key: string
  label: string
  vars: Readonly<Record<string, string>>
}

// Bundled per-doc presets. Each is a PAGE theme (overrides --page-* + --accent),
// NOT a chrome theme. Values are WCAG-checked light-on-light / dark sheets.
//   • sepia      — warm paper, dark ink (matches the workspace sepia page).
//   • solarized  — Solarized-light page (base3 bg, base00 ink, blue accent).
//   • night      — dark sheet (reuses the workspace dark-page palette).
export const DOC_THEME_PRESETS: readonly DocThemePreset[] = [
  {
    key: 'sepia',
    label: 'Sepia',
    // Note: the page-bg here is INTENTIONALLY distinct from the workspace sepia
    // (#f5efe0, which the tokens-css guard test bans from tokens.css as a retired
    // identity literal); this doc-theme sepia uses #f4ecd8 and stays in sync with
    // the [data-doc-theme="sepia"] block in tokens.css.
    vars: {
      '--page-bg': '#f4ecd8',
      '--page-ink': '#433422',
      '--page-ink-muted': '#6f5f48',
      '--accent': '#a8642a',
    },
  },
  {
    key: 'solarized',
    label: 'Solarized',
    vars: {
      '--page-bg': '#fdf6e3',
      '--page-ink': '#586e75',
      '--page-ink-muted': '#93a1a1',
      '--accent': '#268bd2',
    },
  },
  {
    key: 'night',
    label: 'Night',
    // Reuse the workspace dark-page palette so the dark sheet stays consistent.
    vars: { '--page-bg': resolvePageBg('dark'), ...DARK_PAGE_VARS },
  },
]

const PRESET_KEYS: ReadonlySet<string> = new Set(DOC_THEME_PRESETS.map((p) => p.key))
const PAGE_BG_KEYS: ReadonlySet<string> = new Set(PAGE_BG_PRESETS.map((p) => p.value))
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** True iff `k` is one of the bundled per-doc preset keys. */
export function isDocThemePreset(k: unknown): k is string {
  return typeof k === 'string' && PRESET_KEYS.has(k)
}

/** The validated per-doc theme override (all fields optional; absent = inherit). */
export interface DocTheme {
  /** A bundled preset key (sepia | solarized | night). */
  preset?: string
  /** An in-page accent #hex. */
  accent?: string
  /** A page-background preset value (white | sepia | dark). */
  pageBg?: string
}

/**
 * Validate a stored documents.meta.theme blob into a DocTheme. Unknown keys and
 * invalid values are DROPPED (never echoed). Returns {} for non-object input.
 * NEVER throws. This is the trust boundary — only the three allow-listed fields
 * survive, each shape-checked.
 */
export function parseDocTheme(raw: unknown): DocTheme {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const obj = raw as Record<string, unknown>
  const out: DocTheme = {}
  if (isDocThemePreset(obj.preset)) out.preset = obj.preset
  if (typeof obj.accent === 'string' && HEX_RE.test(obj.accent)) out.accent = obj.accent
  if (typeof obj.pageBg === 'string' && PAGE_BG_KEYS.has(obj.pageBg)) out.pageBg = obj.pageBg
  return out
}

/**
 * Resolve a validated DocTheme into CSS token vars to apply on the doc wrapper.
 * Order: preset vars first, then explicit pageBg, then accent (so an explicit
 * accent wins over a preset's accent). Every emitted value is a validated hex or a
 * keyword resolved to a hex — it can NEVER contain a `{`, `}` or `;`, so injecting
 * it inline (style={{...}}) cannot break out of the property. Returns {} when there
 * is no override (the doc inherits the workspace theme).
 */
export function resolveDocThemeVars(theme: DocTheme): Record<string, string> {
  const vars: Record<string, string> = {}

  if (theme.preset) {
    const preset = DOC_THEME_PRESETS.find((p) => p.key === theme.preset)
    if (preset) Object.assign(vars, preset.vars)
  }

  if (theme.pageBg) {
    vars['--page-bg'] = resolvePageBg(theme.pageBg)
    if (isDarkPage(theme.pageBg)) Object.assign(vars, DARK_PAGE_VARS)
  }

  if (theme.accent) {
    vars['--accent'] = theme.accent
    vars['--accent-contrast'] = theme.accent
  }

  return vars
}
