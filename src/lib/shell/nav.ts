// S2: pure shell-chrome helpers.
//
// These functions back the global chrome (sidebar nav rows, the files-page
// `?view=` surfacing, the initial-fallback avatar). They are intentionally
// dependency-free — no `@/db`, no `next/*`, no React — so both the async server
// layout and the client `NavRow`/`UserCluster`/`FileManager` components can
// import them, and they unit-test as plain functions.

/**
 * Is the sidebar nav row for `href` the active one for the current location?
 *
 * Active detection is **query-aware** because the routeless Drive views (Shared,
 * Starred, Recents) share the `/files` route and differ only by `?view=`. The
 * caller passes the resolved `pathname` (no query — `usePathname()` strips it)
 * AND the current `view` query value separately (`useSearchParams().get('view')`).
 *
 * Rules:
 *  - The href is split into its path and its own `?view=` (if any).
 *  - The path must match the pathname (exactly, or as a boundary-aware ancestor
 *    so `/settings/appearance` lights `/settings` but `/files-archive` does NOT
 *    light `/files`).
 *  - When the matched path is `/files`, the *view* must also agree: a row whose
 *    href carries `?view=shared` is active only when the current view normalizes
 *    to `shared`; the bare `/files` row (no `?view=`, i.e. the `all` view) is
 *    active only when the current view normalizes to `all`. This guarantees
 *    exactly one active row per route/view — the bare Files row no longer lights
 *    up under `?view=shared`/`?view=starred`/`?view=recents`, and those rows now
 *    correctly light instead.
 *  - For non-`/files` rows the `view` is irrelevant (plain path matching).
 */
export function isNavRowActive(
  pathname: string | null | undefined,
  href: string,
  view?: string | null | undefined,
): boolean {
  if (!pathname) return false

  const [hrefPath, hrefQuery] = href.split('?')
  const pathMatches = pathname === hrefPath || pathname.startsWith(`${hrefPath}/`)
  if (!pathMatches) return false

  // Files-route rows disambiguate on the normalized `?view=`. The href's own
  // `view=` (if present) is the row's intended view; a bare `/files` href is the
  // `all` view. Compare both through `normalizeFilesView` so `view=all`,
  // missing, and unknown all collapse to `all` consistently on each side.
  if (hrefPath === '/files') {
    const rowView = normalizeFilesView(new URLSearchParams(hrefQuery ?? '').get('view'))
    return normalizeFilesView(view) === rowView
  }

  return true
}

/** The files-page view-state keys reachable via the `?view=` query param. */
export type FilesViewParam = 'all' | 'recents' | 'starred' | 'shared'

/**
 * Normalize a raw `?view=` query value to a files-page view state.
 *
 * Only the ROUTELESS Drive views (Recents / Starred / Shared) are surfaced
 * through the query param — `Files` and `Trash` have their own routes, so the
 * sidebar links those directly and never round-trips through `?view=`. Anything
 * else (missing, `all`, `files`, an unknown string, a routed view) collapses to
 * the default `all`. This reads an existing query param into existing `view`
 * state; it adds no new view behavior (S2-4 is restyle + surfacing only).
 */
export function normalizeFilesView(raw: string | null | undefined): FilesViewParam {
  if (raw === 'recents' || raw === 'starred' || raw === 'shared') return raw
  return 'all'
}

/**
 * Initial-fallback avatar glyph for a user with no profile image.
 *
 * Returns the uppercased first non-whitespace grapheme of the name, or `?` when
 * the name is empty/whitespace. Uses `Array.from` so a multi-byte first
 * character (e.g. an Arabic letter) is taken whole, not split mid-surrogate.
 */
export function userInitial(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) return '?'
  const first = Array.from(trimmed)[0] ?? '?'
  return first.toUpperCase()
}
