'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

// Drop-in sign-out control. POSTs to /api/auth/logout (clears the session
// cookie + row) then refreshes so server components re-render unauthenticated.
// Wire into the app sidebar/footer: <SignOutButton />.
//
// When className includes "parchment-footer-row" the button renders with a
// Material Symbol icon so it matches the cohesive footer row shape.
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function signOut() {
    startTransition(async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.replace('/login')
      router.refresh()
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
