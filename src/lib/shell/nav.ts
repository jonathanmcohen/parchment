// S2: pure shell-chrome helpers.
//
// These functions back the global chrome (sidebar nav rows, the files-page
// `?view=` surfacing, the initial-fallback avatar). They are intentionally
// dependency-free — no `@/db`, no `next/*`, no React — so both the async server
// layout and the client `NavRow`/`UserCluster`/`FileManager` components can
// import them, and they unit-test as plain functions.

/**
 * Is the sidebar nav row for `href` the active one for the current `pathname`?
 *
 * A row is active when the pathname equals its href, or is a descendant segment
 * of it (`/settings/appearance` lights `/settings`). The descendant check is
 * boundary-aware: `/files-archive` must NOT light `/files` just because the
 * string starts the same — the next character has to be a path separator.
 */
export function isNavRowActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false
  if (pathname === href) return true
  return pathname.startsWith(`${href}/`)
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
