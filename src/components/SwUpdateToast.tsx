'use client'

// D2: "Update ready — refresh" toast. When a new service worker has finished
// installing and is waiting (a controller is already active), we surface this
// small dismissible toast instead of force-reloading the page mid-session. On
// click we tell the waiting SW to take over ({ type: 'SKIP_WAITING' }); the
// ServiceWorkerRegister's single 'controllerchange' listener then reloads once.
//
// Visual + a11y contract reuses the WhatsNewToast pattern verbatim (same
// .parchment-whatsnew-toast* classes, role="status" aria-live="polite", the card
// catches its own clicks with NO full-viewport layer — v0.2.8 e2e lesson). It is
// rendered inside the [data-color-scheme] wrapper by ServiceWorkerRegister's
// parent so it themes correctly.

import { useCallback } from 'react'

type Props = {
  /** The installed-and-waiting worker to promote on the user's click. */
  waiting: ServiceWorker
  /** Dismiss without updating (the update still applies on the next full load). */
  onDismiss: () => void
}

export function SwUpdateToast({ waiting, onDismiss }: Props) {
  const refresh = useCallback(() => {
    // Ask the waiting SW to activate now. ServiceWorkerRegister reloads the page
    // once 'controllerchange' fires, so the user lands on the new build cleanly.
    try {
      waiting.postMessage({ type: 'SKIP_WAITING' })
    } catch {
      // If messaging fails, a manual reload still picks up the waiting SW.
      window.location.reload()
    }
  }, [waiting])

  return (
    <div
      data-testid="sw-update-toast"
      className="parchment-whatsnew-toast"
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        data-testid="sw-update-toast-refresh"
        className="parchment-whatsnew-toast-open"
        onClick={refresh}
      >
        <span aria-hidden className="material-symbols-rounded parchment-whatsnew-toast-icon">
          refresh
        </span>
        <span className="parchment-whatsnew-toast-text">
          {'A new version is ready — '}
          <span className="parchment-whatsnew-toast-version">refresh</span>
        </span>
      </button>
      <button
        type="button"
        data-testid="sw-update-toast-dismiss"
        className="parchment-whatsnew-toast-dismiss"
        aria-label="Dismiss update notice"
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  )
}
