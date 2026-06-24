'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Avatar } from './Avatar'
import { useMenuDismiss } from './use-menu-dismiss'
import { useMenuKeyboard } from './use-menu-keyboard'

// S2-5: top-right user cluster — a 32px initial-fallback avatar that opens an
// account menu (Manage account / Sign out / Switch account placeholder).
//
// Surfaces EXISTING behavior only:
//   • Manage account → navigate /settings (existing route).
//   • Sign out       → the existing POST /api/auth/logout (the same call the
//     SignOutButton makes — no second sign-out path is authored).
//   • Switch account → disabled placeholder (single-owner in v0.1; matches the
//     "Shared documents arrive in v0.2" posture). Never silently dropped.
//
// NO app-launcher grid. Flat surface in S2 (S5-3 owns elevation; S5-2 the
// avatar tooltip). Keyboard-operable: Esc closes + restores focus (the K3
// lesson).
export function UserCluster({
  name,
  labels,
}: {
  name: string
  labels: {
    accountMenu: string
    manageAccount: string
    signOut: string
    switchAccount: string
  }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const wrapRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useMenuDismiss(open, () => setOpen(false), wrapRef, toggleRef)
  // Full WAI-ARIA menu keyboard model: focus into menu on open, Arrow/Home/End
  // navigation, roving tabindex, Tab-trap (the K3/G15 lesson). The disabled
  // "Switch account" placeholder is skipped by roving focus.
  useMenuKeyboard(open, menuRef)

  // ArrowDown/ArrowUp on the closed trigger opens + focuses the menu.
  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setOpen(true)
    }
  }

  function manageAccount() {
    setOpen(false)
    router.push('/settings')
  }

  function signOut() {
    setOpen(false)
    startTransition(async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.replace('/login')
      router.refresh()
    })
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={toggleRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labels.accountMenu}
        title={name}
        className="rounded-full focus-visible:outline-none"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        <Avatar name={name} size={32} />
      </button>

      {open && (
        // Flat in S2; S5-3 adopts the shared `.px-menu` elevation shell.
        <div
          ref={menuRef}
          role="menu"
          aria-label={labels.accountMenu}
          className="parchment-account-menu absolute end-0 top-[calc(100%+8px)] z-20 flex min-w-[224px] flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar name={name} size={36} />
            <span className="truncate text-[var(--foreground)] text-sm">{name}</span>
          </div>
          <div className="my-1 border-[var(--border)] border-t" />
          {/* menuitems start at tabIndex -1; useMenuKeyboard rolls focus. */}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="parchment-account-menuitem"
            onClick={manageAccount}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              manage_accounts
            </span>
            {labels.manageAccount}
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="parchment-account-menuitem"
            onClick={signOut}
            disabled={pending}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              logout
            </span>
            {labels.signOut}
          </button>
          <button
            type="button"
            role="menuitem"
            className="parchment-account-menuitem opacity-50"
            disabled
            aria-disabled="true"
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              switch_account
            </span>
            {labels.switchAccount}
          </button>
        </div>
      )}
    </div>
  )
}
