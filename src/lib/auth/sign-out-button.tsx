'use client'

import { useTransition } from 'react'
import { clearOfflineCaches } from '@/lib/offline/clear-caches'

// Drop-in sign-out control. POSTs to /api/auth/logout (clears the session cookie +
// row), purges the offline caches, then hard-navigates to /login so server
// components re-render unauthenticated. Wire into the app sidebar/footer.
//
// When className includes "parchment-footer-row" the button renders with a
// Material Symbol icon so it matches the cohesive footer row shape.
export function SignOutButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition()

  function signOut() {
    startTransition(async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
      // D5: purge the offline shell caches + per-doc Yjs IndexedDB so a shared
      // machine never leaks the departing user's cached pages / document content.
      // Best-effort (never throws) — must not block the redirect.
      await clearOfflineCaches()
      // HARD navigation (not router.replace): a client transition keeps this authed
      // page mounted and its link-prefetch re-populates the cache the instant after
      // we clear it. A full navigation tears it down so the purge sticks.
      window.location.assign('/login')
    })
  }

  const isFooterRow = className?.includes('parchment-footer-row')

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className={
        className ??
        'rounded-md px-2 py-1.5 text-left text-[var(--foreground)] text-sm hover:bg-[var(--background)] disabled:opacity-60'
      }
    >
      {isFooterRow && (
        <span aria-hidden className="material-symbols-rounded text-[20px] leading-none">
          logout
        </span>
      )}
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
