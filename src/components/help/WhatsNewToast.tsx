'use client'

// v0.2.10: post-upgrade "What's new" toast.
//
// After the instance is upgraded, each user sees — ONCE per version — a small
// dismissible toast anchored bottom-left, above the sidebar footer. Clicking it
// opens the existing What's-new pop-out dialog (the SAME WhatsNewDialog the
// HelpMenu renders, imported here so there is one source of truth).
//
// Seen-tracking lives in @/lib/help/whatsnew (pure + unit-tested):
//   • first-ever visit seeds the key silently, shows NO toast (fresh installs
//     must not get an upgrade toast);
//   • a stored version that differs from the current version shows the toast once;
//   • dismiss / click / auto-dismiss persists the current version.
//
// A11y + non-blocking contract (v0.2.8 e2e lesson): role="status" aria-live=
// "polite" so it is announced without stealing focus; it is pointer-events-
// contained (the card catches its own clicks, but there is NO full-viewport layer
// that could intercept clicks elsewhere — see .parchment-whatsnew-toast in
// globals.css). Auto-dismisses after ~15s; Esc / ✕ dismiss manually.

import { useCallback, useEffect, useState } from 'react'
import { WhatsNewDialog } from '@/components/help/HelpMenu'
import { markWhatsNewSeen, whatsNewToastState } from '@/lib/help/whatsnew'

const AUTO_DISMISS_MS = 15_000

type Phase = 'hidden' | 'toast' | 'dialog'

export function WhatsNewToast({ version }: { version: string }) {
  const [phase, setPhase] = useState<Phase>('hidden')

  // Decide once, after mount (client-only — reads localStorage). The state
  // function seeds the key on a first-ever visit as a side effect.
  useEffect(() => {
    if (whatsNewToastState(version).show) {
      setPhase('toast')
    }
    // version is a stable server-provided constant for the app's lifetime.
  }, [version])

  // Auto-dismiss the toast after the timeout. Only while the toast is visible;
  // opening the dialog (or dismissing) clears the timer via the effect cleanup.
  useEffect(() => {
    if (phase !== 'toast') return
    const id = window.setTimeout(() => {
      markWhatsNewSeen(version)
      setPhase('hidden')
    }, AUTO_DISMISS_MS)
    return () => window.clearTimeout(id)
  }, [phase, version])

  const dismiss = useCallback(() => {
    markWhatsNewSeen(version)
    setPhase('hidden')
  }, [version])

  const openDialog = useCallback(() => {
    // Acknowledge the version the moment the user engages, then swap to the dialog.
    markWhatsNewSeen(version)
    setPhase('dialog')
  }, [version])

  // Esc dismisses the toast (without opening the dialog). Only while the toast is
  // showing; the dialog owns its own Esc handling (useFocusTrap).
  useEffect(() => {
    if (phase !== 'toast') return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        dismiss()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [phase, dismiss])

  if (phase === 'dialog') {
    // The shared release-notes pop-out. Closing returns to fully hidden (the
    // version is already persisted, so the toast will not reappear this session).
    return <WhatsNewDialog onClose={() => setPhase('hidden')} />
  }

  if (phase !== 'toast') return null

  return (
    <div
      data-testid="whatsnew-toast"
      className="parchment-whatsnew-toast"
      role="status"
      aria-live="polite"
    >
      {/* The whole message is a button so click / Enter / Space open the dialog. */}
      <button
        type="button"
        data-testid="whatsnew-toast-open"
        className="parchment-whatsnew-toast-open"
        onClick={openDialog}
      >
        <span aria-hidden className="material-symbols-rounded parchment-whatsnew-toast-icon">
          new_releases
        </span>
        <span className="parchment-whatsnew-toast-text">
          {/* Explicit string expressions: JSX inter-line whitespace around tags is
              transform-dependent (Turbopack/SWC ate the space before the em-dash
              where esbuild kept it — caught in live verify). Strings are exact. */}
          {'Updated to '}
          <span className="parchment-whatsnew-toast-version">v{version}</span>
          {' — see what’s new'}
        </span>
      </button>
      <button
        type="button"
        data-testid="whatsnew-toast-dismiss"
        className="parchment-whatsnew-toast-dismiss"
        aria-label="Dismiss update notice"
        onClick={dismiss}
      >
        ✕
      </button>
    </div>
  )
}
