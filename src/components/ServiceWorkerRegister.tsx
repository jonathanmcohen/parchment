'use client'

import { useEffect, useRef, useState } from 'react'
import { SwUpdateToast } from '@/components/SwUpdateToast'
import { APP_VERSION } from '@/lib/version'

/**
 * Registers the service worker in production only, and surfaces an opt-in
 * "refresh to update" toast when a new build is waiting.
 *
 * NOT registered in development: Turbopack HMR relies on direct network fetches
 * for module updates — a SW intercepting those would break hot-reload.
 *
 * Version-scoped registration (D1): the SW is registered at `/sw.js?v=<APP_VERSION>`
 * so a release bumps the SW script URL (browser installs the new SW) AND the SW's
 * cache name (a fresh cache; the old one is swept on activate). No stale shell can
 * survive an upgrade — and no build-time templating of the static sw.js is needed.
 *
 * Update model (D2): we do NOT force-reload the page when a new SW installs. When
 * a new worker reaches 'installed' while a controller is already active, we show
 * the SwUpdateToast; the user clicks it, we message the waiting SW to skipWaiting,
 * and a single 'controllerchange' listener reloads the page exactly once. A first
 * install (no existing controller) shows nothing — there is nothing to refresh.
 *
 * Mounted exactly once in src/app/layout.tsx.
 */
export function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  // Guard so the controllerchange reload fires at most once.
  const reloadingRef = useRef(false)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    // Whether this page was ALREADY controlled by a SW when we registered. On a
    // first-ever visit there is no controller yet; the SW's activate → clients.claim()
    // then fires 'controllerchange' as it takes over THIS already-open page. We must
    // NOT reload in that case — the page is fine as-is, and a reload-on-first-visit is
    // jarring (and races anything mid-render). We only reload when an UPDATE swaps the
    // controller out from under an already-controlled page (the user clicked "refresh
    // to update" → SKIP_WAITING → the new worker activates → controllerchange).
    const hadController = navigator.serviceWorker.controller != null
    const onControllerChange = () => {
      if (!hadController) return // first install's clients.claim() — do not reload.
      if (reloadingRef.current) return
      reloadingRef.current = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    navigator.serviceWorker
      // updateViaCache: 'all' — do NOT revalidate the SW script over the network
      // on every navigation. We already bust the SW via its `?v=<APP_VERSION>` URL
      // (a release changes the URL → the browser installs the new SW), so a
      // per-navigation revalidation is pure overhead — and, critically, when the
      // browser is OFFLINE that revalidation fetch fails and can race a navigation
      // into Chromium's own error page instead of letting the SW serve the cached
      // shell / the /offline fallback. Serving the SW script from the HTTP cache
      // removes that race so offline navigations reliably reach the fetch handler.
      .register(`/sw.js?v=${APP_VERSION}`, { updateViaCache: 'all' })
      .then((reg) => {
        // A worker may already be waiting (installed on a previous page view).
        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaiting(reg.waiting)
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            // New SW installed while an old one still controls the page → offer the
            // refresh. Without a controller this is the first install: stay silent.
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(newWorker)
            }
          })
        })
      })
      .catch(() => {
        // Registration failed (wrong MIME type, no HTTPS, …). The app works without
        // a SW — just without offline support. Never throws.
      })

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  if (!waiting) return null
  return <SwUpdateToast waiting={waiting} onDismiss={() => setWaiting(null)} />
}
