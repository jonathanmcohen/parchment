// v0.2.10: post-upgrade "What's new" toast — pure seen-tracking logic.
//
// After the instance is upgraded to a new version, each user sees — ONCE per
// version — a small dismissible toast. This module owns the localStorage-backed
// decision so it is unit-testable in isolation (no React).
//
// localStorage key: `parchment:whatsnew-seen` stores the last-acknowledged
// version string.
//
// Decision rules (whatsNewToastState):
//   • No key at all (first-ever visit): SEED the key silently with the current
//     version and show NO toast. A brand-new install / a fresh user must not be
//     shown an "upgrade" toast — there was nothing to upgrade FROM.
//   • Stored value === current version: no toast (already acknowledged).
//   • Stored value exists AND differs from current version: SHOW the toast. This
//     is the genuine post-upgrade case (the stored version is the one the user
//     last ran / acknowledged, and the app is now newer/different).
//
// markWhatsNewSeen advances the stored version to the current one; called on
// dismiss (✕), on click-through to the dialog, and on auto-dismiss, so a given
// version is never nagged twice.
//
// All storage access is try/catch-guarded and SSR-guarded: private mode / quota
// / disabled storage degrades to "no toast", never a crash.

export const WHATSNEW_SEEN_KEY = 'parchment:whatsnew-seen'

/** SSR-safe localStorage read; returns null on any failure. */
function readSeen(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(WHATSNEW_SEEN_KEY)
  } catch {
    return null
  }
}

/** SSR-safe localStorage write; silent on any failure. */
function writeSeen(version: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WHATSNEW_SEEN_KEY, version)
  } catch {
    // quota exceeded / private mode / disabled — silent, nothing to do.
  }
}

export type WhatsNewToastState = {
  /** Whether the upgrade toast should be shown. */
  show: boolean
  /** The current app version (echoed for the caller's label + persistence). */
  version: string
}

/**
 * Decide whether the post-upgrade toast should show for `current`.
 *
 * NOTE: this function has a deliberate side effect on the FIRST-visit path only —
 * it seeds the key with `current` so a genuine future upgrade is detectable. Every
 * other path is read-only; the stored version is advanced by markWhatsNewSeen when
 * the user actually acknowledges the toast.
 */
export function whatsNewToastState(current: string): WhatsNewToastState {
  const stored = readSeen()

  // First-ever visit: seed silently, show nothing.
  if (stored === null) {
    writeSeen(current)
    return { show: false, version: current }
  }

  // Already acknowledged this exact version.
  if (stored === current) {
    return { show: false, version: current }
  }

  // Stored a different (older/other) version → genuine upgrade → show once.
  return { show: true, version: current }
}

/** Persist `current` as the acknowledged version (dismiss / click / auto-dismiss). */
export function markWhatsNewSeen(current: string): void {
  writeSeen(current)
}
