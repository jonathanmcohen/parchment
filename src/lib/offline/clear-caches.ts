'use client'

import { isParchmentCacheKey, isParchmentDocDb } from '@/lib/offline/cache-names'

// Logout cache-clear (D5). On sign-out we purge everything the offline layer
// stored for the departing user so a shared machine never leaks the previous
// user's cached app shell or per-doc Yjs document content:
//
//   • Cache Storage — every `parchment-*` shell cache the service worker built.
//   • IndexedDB      — every `parchment-doc-<id>` store y-indexeddb created.
//
// The caches/IndexedDB APIs are browser-only and the logout /api route runs on
// the server, so this MUST run client-side (called from the sign-out buttons).
// Everything is best-effort and individually guarded: a failure here must never
// block the actual sign-out redirect.
//
// navigator.onLine trap (repo lesson): we never read navigator.onLine here, and
// every browser-API access is feature-detected — safe to import anywhere.

async function clearCacheStorage(): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const keys = await caches.keys()
    await Promise.all(keys.filter(isParchmentCacheKey).map((key) => caches.delete(key)))
  } catch {
    // Cache Storage unavailable / blocked — nothing to clean.
  }
}

async function clearDocDatabases(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  // indexedDB.databases() is not in every engine (older Firefox/Safari). Where it
  // is missing we can't enumerate to delete per-doc stores — accept that limit
  // rather than guessing names. (Documented in the offline report.)
  const enumerate = (
    indexedDB as unknown as { databases?: () => Promise<Array<{ name?: string }>> }
  ).databases
  if (typeof enumerate !== 'function') return
  try {
    const dbs = await enumerate.call(indexedDB)
    await Promise.all(
      dbs
        .map((d) => d.name)
        .filter((name): name is string => typeof name === 'string' && isParchmentDocDb(name))
        .map(
          (name) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(name)
              // Resolve on every terminal outcome — a blocked/errored delete must
              // not hang the sign-out flow.
              req.onsuccess = () => resolve()
              req.onerror = () => resolve()
              req.onblocked = () => resolve()
            }),
        ),
    )
  } catch {
    // Enumeration failed — best-effort, move on.
  }
}

// Ask the active service worker to purge its own caches. This runs in the SW
// context, so it survives the page unloading during the logout redirect — it
// mops up any authed shell entry that the outgoing page's link-prefetch might
// have re-added between our page-side delete and the navigation. Best-effort.
function messageSwToClear(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' })
  } catch {
    // No controller / messaging unavailable — the page-side delete already ran.
  }
}

/**
 * Purge Parchment's offline browser storage (SW caches + per-doc Yjs IndexedDB).
 * Best-effort and never throws; safe to `await` immediately before a logout
 * redirect. No-op outside the browser.
 *
 * IMPORTANT (logout must be a HARD navigation): call this, then send the browser
 * to /login via window.location — NOT the client router. A client-side transition
 * keeps the authed page (and its Next.js link-prefetching) mounted, which re-adds
 * authed shell HTML to the cache the instant after we clear it. A full navigation
 * tears that page down; the SW-side purge (messageSwToClear) then runs after the
 * page is gone, and /login only ever caches its public assets.
 */
export async function clearOfflineCaches(): Promise<void> {
  if (typeof window === 'undefined') return
  messageSwToClear()
  await Promise.all([clearCacheStorage(), clearDocDatabases()])
}
