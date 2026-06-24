// F1: pure handler for the Account → Appearance color-scheme control.
//
// Split out from the AccountThemeSelect client component so the wiring logic
// (merge the chosen scheme into the *full* stored theme, PUT it, then trigger a
// server re-render) is unit-testable in the node environment — no RTL/jsdom.
//
// Crux: the PUT body MUST carry the whole WorkspaceTheme, not just the scheme.
// setWorkspaceTheme runs the body through parseTheme, which falls back to
// DEFAULT_THEME for any missing field — so sending `{ colorScheme }` alone would
// silently reset the user's accent / font / pageBg / accessibility choices. We
// merge over the current theme exactly as AppearanceSettings.save does.

import type { WorkspaceTheme } from '@/lib/editor/theme'

/** The minimal slice of next/navigation's router this handler needs. */
export interface ThemeRouter {
  refresh: () => void
}

/**
 * Persist a new color scheme and re-render the server tree so the layout's
 * `data-color-scheme` + `themeCssVars` reflect it without a manual reload.
 *
 * @returns the merged theme that was sent (handy for optimistic UI state).
 * @throws if the PUT response is not ok (caller surfaces an error).
 */
export async function applyColorScheme(
  current: WorkspaceTheme,
  scheme: WorkspaceTheme['colorScheme'],
  deps: { fetch: typeof fetch; router: ThemeRouter },
): Promise<WorkspaceTheme> {
  const next: WorkspaceTheme = { ...current, colorScheme: scheme }
  const res = await deps.fetch('/api/settings/theme', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  })
  if (!res.ok) throw new Error('save failed')
  // router.refresh() is mandatory: themeCssVars + data-color-scheme are
  // server-rendered, so the new scheme only takes effect after the RSC re-fetch
  // (NOT a client-only class toggle).
  deps.router.refresh()
  return next
}
