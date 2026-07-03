/**
 * SW cache-strategy classifier — shared between public/sw.js and the unit tests.
 *
 * Extracted as a pure function so the rules can be tested without a real SW
 * environment. The SW imports it via a self-contained copy (SW is plain JS, can't
 * use TS imports), but this module is the source-of-truth for tests.
 */

export type SwStrategy = 'network-only' | 'cache-first' | 'network-first' | 'swr'

/**
 * Classify a fetch request into a caching strategy.
 *
 * @param url     - Fully-resolved URL string of the request.
 * @param method  - HTTP method (e.g. 'GET', 'POST').
 * @param mode    - RequestMode (e.g. 'navigate', 'cors', 'no-cors', 'same-origin').
 * @param origin  - The SW's own origin (window.location.origin). Used to detect
 *                  cross-origin and WebSocket URLs.
 */
export function swStrategyFor(
  url: string,
  method: string,
  mode: RequestMode | string,
  origin: string,
): SwStrategy {
  // 1. Non-GET requests must always go straight to the network — never cache
  //    mutations (POST/PUT/DELETE/PATCH). Auth tokens, CSRF, etc. must not be
  //    intercepted.
  if (method.toUpperCase() !== 'GET') {
    return 'network-only'
  }

  // 2. WebSocket / non-http(s) schemes → network-only. The collab server lives
  //    at ws://host:1234 — intercepting it would break collaboration entirely.
  if (url.startsWith('ws:') || url.startsWith('wss:')) {
    return 'network-only'
  }

  // 3. Cross-origin requests (CDN fonts, external embeds, etc.) → network-only.
  //    We only cache our own origin.
  let urlOrigin: string
  try {
    urlOrigin = new URL(url).origin
  } catch {
    // Unparseable URL — pass through.
    return 'network-only'
  }
  if (urlOrigin !== origin) {
    return 'network-only'
  }

  const pathname = new URL(url).pathname

  // 4. API routes → network-only. Caching API responses would break real-time
  //    data, auth, and collaboration. Matches /api/ prefix.
  if (pathname.startsWith('/api/')) {
    return 'network-only'
  }

  // 5. Auth endpoints → network-only (belt + suspenders alongside /api/ rule).
  if (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/logout')
  ) {
    return 'network-only'
  }

  // 6. Next.js hashed static assets → cache-first. These have content-hash in
  //    the URL so they are immutable: once cached they can be served forever.
  //    Matches /_next/static/ (JS chunks, CSS, images, fonts built by Next).
  if (pathname.startsWith('/_next/static/')) {
    return 'cache-first'
  }

  // 6b. Self-hosted fonts (/fonts/*.woff2) and PWA icons (/icons/*.png) →
  //     cache-first. These are versioned-by-content in practice (a font/icon
  //     swap ships a new file), so serving a cached copy is safe and makes the
  //     app shell paint correctly on the FIRST offline load (fonts are otherwise
  //     a render-blocking miss). The big material-symbols file is cached lazily
  //     on first fetch (not precached) to avoid a 5 MB install cost.
  if (pathname.startsWith('/fonts/') || pathname.startsWith('/icons/')) {
    return 'cache-first'
  }

  // 7. Navigation requests (full page loads, back/forward) → network-first.
  //    Network-first ensures the user always gets the latest HTML/build on a new
  //    deploy; falls back to cached shell only when offline.
  if (mode === 'navigate') {
    return 'network-first'
  }

  // 8. All other same-origin GETs (/_next/image, manifest, etc.) →
  //    stale-while-revalidate: serve from cache instantly, revalidate in background.
  return 'swr'
}

// ---------------------------------------------------------------------------
// Version-scoped cache naming.
//
// public/sw.js is a STATIC asset (Next does not template it) and the release
// pipeline is off-limits, so the app version is threaded to the SW through its
// registration URL (`/sw.js?v=<APP_VERSION>`): the SW reads that `?v=` off
// self.location and builds a version-scoped cache name from it here. A version
// bump changes the SW script URL (new SW installs) AND the cache name (a fresh
// cache; the old one is swept on activate) — so an upgrade can never leave a
// stale shell pinned. These are the source-of-truth; public/sw.js inlines the
// same one-liners.
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'parchment-shell-'

/**
 * Build the version-scoped shell cache name. A blank/missing version (local dev,
 * or a registration URL without `?v=`) falls back to a stable "dev" suffix.
 */
export function shellCacheName(version: string | null | undefined): string {
  const v = (version ?? '').trim()
  return `${CACHE_PREFIX}${v === '' ? 'dev' : v}`
}

/**
 * Activate-time cleanup predicate: is `name` a Parchment shell cache that is NOT
 * the current one? Only our own caches (parchment-*) are ever considered — a
 * cache owned by other code (e.g. a future workbox integration) is left alone.
 * The legacy pre-versioned `parchment-v1` name matches `parchment-` and so is
 * swept on the first post-upgrade activate.
 */
export function isStaleShellCache(name: string, currentName: string): boolean {
  if (name === currentName) return false
  return name.startsWith('parchment-')
}
