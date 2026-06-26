// Client-side DOM helper: immediately paints a WorkspaceTheme onto the layout
// wrapper without waiting for a server round-trip.
//
// The (app) layout is SERVER-RENDERED — it sets data-color-scheme, data-high-contrast,
// data-font, and style={themeCssVars(theme)} on the outer <div> during SSR. After
// that, theme changes go:  PUT /api/settings/theme → router.refresh() → RSC
// re-fetch → new HTML → paint. The router.refresh() path is unreliable in this
// Next 16 setup (client Router Cache), so the change often doesn't paint until a
// hard reload.
//
// applyThemeToDom() short-circuits that: it mutates the EXISTING wrapper element
// in the live DOM instantly — zero flicker, zero server round-trip. The PUT +
// router.refresh() still runs in the background so reloads + other tabs stay
// correct; this function is additive, not a replacement.
//
// Exported as a standalone module (not inlined into theme.ts) so it is:
//   • never imported on the server path (no `typeof document` guard leaks into
//     the pure-module boundary that layout.tsx uses at build time)
//   • easy to import from any client component without pulling in React

import { themeCssVars, type WorkspaceTheme } from './theme'

/**
 * Apply a {@link WorkspaceTheme} to the live DOM wrapper immediately.
 *
 * Finds the element set by (app)/layout.tsx: `document.querySelector('[data-color-scheme]')`.
 * If none is found (e.g. called from a test environment without the layout, or
 * during SSR), the function is a no-op.
 */
export function applyThemeToDom(theme: WorkspaceTheme): void {
  // SSR guard: this module may be imported in a client boundary that gets
  // tree-shaken on the server, but be explicit to be safe.
  if (typeof document === 'undefined') return

  const el = document.querySelector('[data-color-scheme]') as HTMLElement | null
  if (!el) return

  // data-color-scheme: 'light' | 'dark' | 'system'
  el.dataset.colorScheme = theme.colorScheme

  // data-high-contrast: present (="true") when on, absent when off.
  if (theme.highContrast) {
    el.setAttribute('data-high-contrast', 'true')
  } else {
    el.removeAttribute('data-high-contrast')
  }

  // data-font: "dyslexic" when on, absent when off.
  if (theme.dyslexicFont) {
    el.setAttribute('data-font', 'dyslexic')
  } else {
    el.removeAttribute('data-font')
  }

  // data-page-bg: mirrors the SSR logic in (app)/layout.tsx.
  // 'dark' enables dark-document-page CSS overrides + the Shiki github-dark theme
  // on code blocks.  'light' covers white / sepia / any other sheet colour.
  el.dataset.pageBg = theme.pageBg === 'dark' ? 'dark' : 'light'

  // CSS custom properties (--accent, --font-heading, --font-body, --page-bg, …).
  // themeCssVars returns a Record<string, string> of `--*` property names.
  for (const [name, value] of Object.entries(themeCssVars(theme))) {
    el.style.setProperty(name, String(value))
  }
}
