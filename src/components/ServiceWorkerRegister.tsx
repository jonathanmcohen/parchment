'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker in production only.
 *
 * NOT registered in development: Turbopack HMR relies on direct network
 * fetches for module updates — a SW intercepting those requests would break
 * hot-reload and produce confusing stale-module errors in the dev server.
 *
 * In production the SW is registered once on mount, handles update-found by
 * installing the new SW immediately (skipWaiting is called in sw.js), then
 * reloads the page so clients never get stranded on a stale build.
 *
 * Mounted exactly once in src/app/layout.tsx.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Guard: only register in production + when the SW API is available.
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | null = null

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registration = reg

        // Listen for a new SW waiting to activate.
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            // New SW has installed and the old one is still controlling — reload
            // so the user immediately gets the new build. The new SW calls
            // skipWaiting() on install so this fires promptly after the new SW
            // finishes installing.
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.location.reload()
            }
          })
        })
      })
      .catch(() => {
        // SW registration failed (e.g. wrong MIME type, HTTPS not available).
        // Never throws — the app works without a SW, just without offline support.
      })

    return () => {
      // Nothing to clean up — the SW registration persists across renders.
      void registration
    }
  }, [])

  // Renders nothing — this is a side-effect-only component.
  return null
}
