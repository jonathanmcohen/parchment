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
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        // /offline route may not exist yet during first install — ignore so the
        // SW still installs. It will be cached on first navigation.
      })
      .finally(() => self.skipWaiting()),
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
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      // Update the shell cache so the offline fallback stays fresh.
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
