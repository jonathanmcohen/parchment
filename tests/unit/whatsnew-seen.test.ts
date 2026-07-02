// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { markWhatsNewSeen, WHATSNEW_SEEN_KEY, whatsNewToastState } from '@/lib/help/whatsnew'

// v0.2.10: post-upgrade "What's new" toast — seen-tracking logic.
//
// Rules (see feature spec):
//   • FIRST-ever visit (no key): seed the key silently with the CURRENT version,
//     show NO toast (fresh installs / brand-new users must not get an upgrade toast).
//   • Stored value === current version: no toast.
//   • Stored value exists AND differs from current version: show the toast (ONCE).
//   • Dismiss / click: store the current version (so the toast never re-appears
//     for this version).
//
// whatsNewToastState(current) is the single pure decision function. It is allowed
// to WRITE the seed on the first-visit path (that's the "seed silently" behavior),
// so the tests assert both the returned decision AND the resulting stored value.

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('whatsNewToastState — seen/version logic', () => {
  it('first-ever visit (no key): seeds current version silently, shows NO toast', () => {
    expect(window.localStorage.getItem(WHATSNEW_SEEN_KEY)).toBeNull()

    const state = whatsNewToastState('0.2.10')

    expect(state.show).toBe(false)
    // The key is seeded with the current version so a later real upgrade is detected.
    expect(window.localStorage.getItem(WHATSNEW_SEEN_KEY)).toBe('0.2.10')
  })

  it('stored value equals current version: no toast, key unchanged', () => {
    window.localStorage.setItem(WHATSNEW_SEEN_KEY, '0.2.10')

    const state = whatsNewToastState('0.2.10')

    expect(state.show).toBe(false)
    expect(window.localStorage.getItem(WHATSNEW_SEEN_KEY)).toBe('0.2.10')
  })

  it('stored value differs from current version: SHOW the toast', () => {
    window.localStorage.setItem(WHATSNEW_SEEN_KEY, '0.2.9')

    const state = whatsNewToastState('0.2.10')

    expect(state.show).toBe(true)
    expect(state.version).toBe('0.2.10')
    // Reading the decision must NOT prematurely clear the pending state; the key is
    // only advanced once the user dismisses/clicks (markWhatsNewSeen).
    expect(window.localStorage.getItem(WHATSNEW_SEEN_KEY)).toBe('0.2.9')
  })

  it('markWhatsNewSeen stores the current version (dismiss/click persists)', () => {
    window.localStorage.setItem(WHATSNEW_SEEN_KEY, '0.2.9')

    // User saw the toast for 0.2.10 and dismissed it.
    markWhatsNewSeen('0.2.10')
    expect(window.localStorage.getItem(WHATSNEW_SEEN_KEY)).toBe('0.2.10')

    // Now the toast must NOT show again for the same version.
    expect(whatsNewToastState('0.2.10').show).toBe(false)
  })

  it('an older downgrade (stored newer than current) still counts as "differs" → shows', () => {
    // Defensive: any inequality shows (spec says "differs", not "is newer").
    window.localStorage.setItem(WHATSNEW_SEEN_KEY, '0.3.0')

    expect(whatsNewToastState('0.2.10').show).toBe(true)
  })

  it('is resilient when localStorage throws (private mode): no toast, no crash', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    // Simulate a storage access that throws on read.
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage disabled')
      },
    })

    let state: ReturnType<typeof whatsNewToastState>
    expect(() => {
      state = whatsNewToastState('0.2.10')
    }).not.toThrow()
    // biome-ignore lint/style/noNonNullAssertion: assigned in the block above
    expect(state!.show).toBe(false)

    // Restore.
    if (original) Object.defineProperty(window, 'localStorage', original)
  })
})
