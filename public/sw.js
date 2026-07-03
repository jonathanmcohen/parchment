/**
 * Parchment Service Worker — hand-rolled, no workbox/next-pwa.
 *
 * Cache strategy (see src/lib/sw-strategy.ts for the canonical classifier):
 *   /_next/static/**   → cache-first   (content-hashed, immutable)
 *   /fonts/** /icons/**→ cache-first   (self-hosted, versioned-by-content)
 *   navigate           → network-first (never serve stale HTML; offline fallback)
 *   /api/**            → network-only  (pass through, never cache)
 *   ws:/wss:           → network-only  (collab WebSocket)
 *   non-GET            → network-only  (mutations)
 *   other same-origin  → stale-while-revalidate
 *
 * Versioned caches (see src/lib/sw-strategy.ts shellCacheName/isStaleShellCache):
 *   The app version is threaded in via the registration URL `/sw.js?v=<APP_VERSION>`.
 *   We read that `?v=` off self.location and scope the cache name to it, so an
 *   upgrade lands a fresh cache and the old one is swept on activate — a release
 *   can never leave a stale shell pinned.
 *
 * Update model (D2): the new SW does NOT skipWaiting on install; it waits. The
 * page's ServiceWorkerRegister surfaces a "refresh to update" toast and, on the
 * user's click, posts { type: 'SKIP_WAITING' } so we activate then. This avoids
 * an unsolicited mid-session reload. First install (no controller) activates as
 * usual — there is nothing to refresh from.
 */

// Derive the version-scoped cache name from the registration URL's `?v=`.
// Mirrors shellCacheName() in src/lib/sw-strategy.ts (kept in sync by hand).
const _SW_VERSION = new URL(self.location.href).searchParams.get('v')
const CACHE_VERSION = `parchment-shell-${_SW_VERSION && _SW_VERSION.trim() !== '' ? _SW_VERSION.trim() : 'dev'}`

// Shell URLs to precache on install. '/' is the app shell (required for offline).
// '/offline' is the graceful never-visited-doc fallback page. Core self-hosted
// fonts + PWA icons make the shell paint correctly on the first offline load.
// The 5 MB material-symbols font is intentionally NOT precached (cached lazily,
// cache-first, on first fetch).
const PRECACHE_URLS = [
  '/',
  '/offline',
  '/fonts/roboto-400.woff2',
  '/fonts/roboto-500.woff2',
  '/fonts/roboto-700.woff2',
  '/fonts/roboto-mono-400.woff2',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// ---------------------------------------------------------------------------
// Install — precache the shell. Each URL is added independently (NOT via a single
// atomic cache.addAll) so one 404 (e.g. /offline missing on an old deploy, or a
// renamed font) can never roll back the critical '/' precache. '/' is added first
// and its failure propagates (the app must have a shell); all others are
// best-effort. We do NOT skipWaiting here — see the update model above.
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      // Critical: the app shell must be cached or offline support is pointless.
      await cache.add('/')
      // Everything else is best-effort — a single miss must not fail the install.
      await Promise.all(
        PRECACHE_URLS.filter((u) => u !== '/').map((url) =>
          cache.add(url).catch(() => {
            // Missing/renamed asset — ignore; it caches lazily on first fetch.
          }),
        ),
      )
    }),
  )
})

// ---------------------------------------------------------------------------
// Activate — delete stale Parchment caches, claim existing clients immediately.
// Only our own (parchment-*) caches other than the current one are removed;
// caches owned by other code are left untouched. Mirrors isStaleShellCache().
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION && key.startsWith('parchment-'))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// ---------------------------------------------------------------------------
// Message handler:
//   SKIP_WAITING  — the page tells a waiting SW to take over now (user clicked
//                   "refresh to update"). skipWaiting() promotes this worker; the
//                   page's single 'controllerchange' listener then reloads once.
//   CLEAR_CACHES  — logout purge. Delete every parchment-* cache from the SW
//                   context so it completes even after the logging-out page has
//                   navigated away (mopping up any authed shell entry a last-
//                   moment link-prefetch re-added). Only our own caches; the HTTP
//                   cache and other-origin caches are untouched.
// ---------------------------------------------------------------------------
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data) return
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  } else if (data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((k) => k.startsWith('parchment-')).map((k) => caches.delete(k))),
        ),
    )
  }
})

// ---------------------------------------------------------------------------
// Strategy classifier — mirrors src/lib/sw-strategy.ts (plain JS copy).
// ---------------------------------------------------------------------------
function swStrategyFor(url, method, mode, origin) {
  if (method.toUpperCase() !== 'GET') return 'network-only'
  if (url.startsWith('ws:') || url.startsWith('wss:')) return 'network-only'

  let urlOrigin
  try {
    urlOrigin = new URL(url).origin
  } catch {
    return 'network-only'
  }
  if (urlOrigin !== origin) return 'network-only'

  const pathname = new URL(url).pathname

  if (pathname.startsWith('/api/')) return 'network-only'
  if (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/logout')
  )
    return 'network-only'

  if (pathname.startsWith('/_next/static/')) return 'cache-first'
  if (pathname.startsWith('/fonts/') || pathname.startsWith('/icons/')) return 'cache-first'

  if (mode === 'navigate') return 'network-first'

  return 'swr'
}

// ---------------------------------------------------------------------------
// Fetch — apply strategy based on request classification.
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event
  const origin = self.location.origin
  const strategy = swStrategyFor(request.url, request.method, request.mode, origin)

  if (strategy === 'network-only') {
    // Do NOT call respondWith — let the browser handle it natively.
    return
  }

  if (strategy === 'cache-first') {
    event.respondWith(cacheFirst(request))
    return
  }

  if (strategy === 'network-first') {
    event.respondWith(networkFirst(request))
    return
  }

  // swr
  event.respondWith(staleWhileRevalidate(request))
})

// ---------------------------------------------------------------------------
// Strategy implementations
// ---------------------------------------------------------------------------

/**
 * Cache-first: serve from cache immediately; fetch + cache on miss.
 * Used for immutable /_next/static/ assets and self-hosted fonts/icons.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION)
    cache.put(request, response.clone())
  }
  return response
}

/**
 * Network-first: try the network, fall back to cache (then offline page).
 * Used for navigation requests — guarantees fresh HTML after a deploy.
 *
 * Redirected responses (response.redirected === true) are NOT cached under the
 * original request URL. A followed redirect has ok === true but its .url differs
 * from the request URL. Storing it under the original key would silently serve
 * the redirect destination's content for the original URL on the next offline
 * load, bypassing any server-side redirect logic (e.g. /d/docId → /d/docId/).
 * We skip caching redirects; they are re-fetched on each online visit and only
 * the resolved destination gets cached when that URL is fetched directly.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok && !response.redirected) {
      // Update the shell cache so the offline fallback stays fresh.
      // Skip redirected responses — cache.put under the original URL would store
      // the redirect destination's body at the wrong key.
      const cache = await caches.open(CACHE_VERSION)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Offline — serve the cached version of THIS page if we have it. A doc that
    // was opened online is cached under its own URL here (and its body then
    // hydrates from IndexedDB via the editor's y-indexeddb path), so a reload of
    // an already-visited doc works offline. (Flow 4a.)
    const cached = await caches.match(request)
    if (cached) return cached
    // A never-visited page (flow 4c): show the dedicated, graceful /offline page
    // rather than the raw file-list shell or a browser error page. Fall further
    // back to the app shell '/', then a minimal inline notice.
    const offline = await caches.match('/offline')
    if (offline) return offline
    const shell = await caches.match('/')
    if (shell) return shell
    return new Response(
      '<!doctype html><html><head><title>Offline</title></head><body><h1>You are offline</h1><p>Parchment will resume when your connection returns.</p></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html' } },
    )
  }
}

/**
 * Stale-while-revalidate: serve from cache immediately (if available),
 * revalidate in background. For same-origin GETs that aren't HTML or static.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION)
  const cached = await cache.match(request)

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached ?? new Response('', { status: 503 }))

  return cached ?? fetchPromise
}
