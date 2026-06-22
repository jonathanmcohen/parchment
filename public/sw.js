/**
 * Parchment Service Worker — hand-rolled, no workbox/next-pwa.
 *
 * Cache strategy (see src/lib/sw-strategy.ts for the canonical classifier):
 *   /_next/static/**   → cache-first   (content-hashed, immutable)
 *   navigate           → network-first (never serve stale HTML)
 *   /api/**            → network-only  (pass through, never cache)
 *   ws:/wss:           → network-only  (collab WebSocket)
 *   non-GET            → network-only  (mutations)
 *   other same-origin  → stale-while-revalidate
 */

const CACHE_VERSION = 'parchment-v1'
// Shell URLs to precache on install (minimal set — the dynamic assets get
// cached lazily on first fetch).
const PRECACHE_URLS = ['/', '/offline']

// ---------------------------------------------------------------------------
// Install — precache shell + skipWaiting so the new SW activates immediately.
//
// cache.addAll() is atomic: if any URL fails (e.g. /offline returns 404 on
// first deploy because the route doesn't exist yet), the ENTIRE batch is
// rolled back — including the app shell '/'. That would leave nothing precached
// and the app unable to load offline even after visiting once.
//
// Fix: cache '/' and '/offline' in separate calls. The app shell '/' is
// always cached (required for offline support). '/offline' is best-effort —
// a 404 on first deploy is silently ignored and it will be cached lazily on
// first navigation, or on the next SW install once the route exists.
//
// skipWaiting() is chained last in the waitUntil promise (not in .finally())
// so event.waitUntil properly holds the install event open until skipWaiting
// resolves, which is the spec-correct pattern.
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        // Cache the app shell unconditionally — this is the critical precache.
        cache
          .add('/')
          .then(() =>
            // Cache /offline separately; 404 on first deploy is expected and safe.
            cache.add('/offline').catch(() => {
              // /offline route may not exist yet — ignore so '/' is still cached.
            }),
          ),
      )
      .then(() => self.skipWaiting()),
  )
})

// ---------------------------------------------------------------------------
// Activate — delete stale caches, claim existing clients immediately.
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
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
 * Used for immutable /_next/static/ assets.
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
    // Offline — serve cached version if available.
    const cached = await caches.match(request)
    if (cached) return cached
    // Last resort: serve the offline fallback page.
    const offline = await caches.match('/offline')
    if (offline) return offline
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
