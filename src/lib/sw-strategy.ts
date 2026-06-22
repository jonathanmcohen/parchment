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

  // 7. Navigation requests (full page loads, back/forward) → network-first.
  //    Network-first ensures the user always gets the latest HTML/build on a new
  //    deploy; falls back to cached shell only when offline.
  if (mode === 'navigate') {
    return 'network-first'
  }

  // 8. All other same-origin GETs (/_next/image, /icons/, manifest, etc.) →
  //    stale-while-revalidate: serve from cache instantly, revalidate in background.
  return 'swr'
}
