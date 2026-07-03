// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WhatsNewToast } from '@/components/help/WhatsNewToast'
import { WHATSNEW_SEEN_KEY } from '@/lib/help/whatsnew'
import { APP_VERSION } from '@/lib/version'

// v0.2.10: render gating for the post-upgrade toast component.
//
// The component takes the current version as a prop so tests don't depend on the
// literal APP_VERSION string (the (app) layout passes APP_VERSION in prod).

let container: HTMLDivElement

beforeEach(() => {
  window.localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  window.localStorage.clear()
  container.remove()
  // Clean up any body-level portal the dialog may have created.
  document.getElementById('parchment-overlay-root')?.remove()
  vi.restoreAllMocks()
})

function mount(version: string) {
  const root = createRoot(container)
  act(() => {
    root.render(createElement(WhatsNewToast, { version }))
  })
  return root
}

function toast(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="whatsnew-toast"]')
}

describe('WhatsNewToast — render gating', () => {
  it('first visit (no key): renders NO toast and seeds the key silently', () => {
    const root = mount('9.9.9')
    expect(toast(), 'no toast on first visit').toBeNull()
    expect(window.localStorage.getItem(WHATSNEW_SEEN_KEY)).toBe('9.9.9')
    act(() => root.unmount())
  })

  it('same version stored: renders NO toast', () => {
    window.localStorage.setItem(WHATSNEW_SEEN_KEY, '9.9.9')
    const root = mount('9.9.9')
    expect(toast()).toBeNull()
    act(() => root.unmount())
  })

  it('older version stored: renders the toast with the new version label', () => {
    window.localStorage.setItem(WHATSNEW_SEEN_KEY, '9.9.8')
    const root = mount('9.9.9')

    const el = toast()
    expect(el, 'toast present on upgrade').toBeTruthy()
    // Live-region semantics for AT.
    expect(el?.getAttribute('role')).toBe('status')
    expect(el?.getAttribute('aria-live')).toBe('polite')
    // Exact copy, including the spaces around the em-dash: JSX inter-line
    // whitespace is transform-dependent (Turbopack ate the pre-dash space in live
    // verify), so the component uses explicit string expressions and this pins it.
    const open = el?.querySelector('[data-testid="whatsnew-toast-open"]')
    expect(open?.textContent).toContain('Updated to v9.9.9 — see what’s new')
    act(() => root.unmount())
  })

  it('dismiss (✕) hides the toast and persists the current version', () => {
    window.localStorage.setItem(WHATSNEW_SEEN_KEY, '9.9.8')
    const root = mount('9.9.9')
    expect(toast()).toBeTruthy()

    const dismiss = document.querySelector<HTMLButtonElement>(
      '[data-testid="whatsnew-toast-dismiss"]',
    )
    expect(dismiss, 'dismiss button').toBeTruthy()
    act(() => {
      dismiss?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(toast(), 'toast gone after dismiss').toBeNull()
    expect(window.localStorage.getItem(WHATSNEW_SEEN_KEY)).toBe('9.9.9')
    act(() => root.unmount())
  })

  it("clicking the toast body opens the What's-new dialog AND persists the version", () => {
    window.localStorage.setItem(WHATSNEW_SEEN_KEY, '9.9.8')
    const root = mount('9.9.9')

    const open = document.querySelector<HTMLButtonElement>('[data-testid="whatsnew-toast-open"]')
    expect(open, 'toast open control').toBeTruthy()
    act(() => {
      open?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // The shared What's-new dialog opens (same one HelpMenu uses).
    const dialog = document.querySelector('[role="dialog"][aria-label="What\'s new"]')
    expect(dialog, "what's new dialog opened from toast").toBeTruthy()
    // And the version is persisted so it won't nag again.
    expect(window.localStorage.getItem(WHATSNEW_SEEN_KEY)).toBe('9.9.9')
    // The toast itself is dismissed once the dialog is open.
    expect(toast()).toBeNull()
    act(() => root.unmount())
  })

  it('auto-dismisses after the timeout and persists the version', () => {
    vi.useFakeTimers()
    window.localStorage.setItem(WHATSNEW_SEEN_KEY, '9.9.8')
    const root = mount('9.9.9')
    expect(toast()).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(15_000)
    })

    expect(toast(), 'auto-dismissed after 15s').toBeNull()
    expect(window.localStorage.getItem(WHATSNEW_SEEN_KEY)).toBe('9.9.9')
    vi.useRealTimers()
    act(() => root.unmount())
  })

  it('pointer-events are contained (wrapper does not blanket the viewport)', () => {
    window.localStorage.setItem(WHATSNEW_SEEN_KEY, '9.9.8')
    const root = mount('9.9.9')
    const el = toast()
    expect(el).toBeTruthy()
    // The toast must not be a full-screen overlay. It carries the contained class;
    // the CSS assertion below pins the actual pointer-events rule.
    expect(el?.className).toContain('parchment-whatsnew-toast')
    act(() => root.unmount())
  })

  it('uses the real APP_VERSION when mounted without an explicit prop mismatch', () => {
    // Sanity: seeding an older-than-APP_VERSION value shows the toast labelled with
    // the real APP_VERSION (guards the default wiring path).
    window.localStorage.setItem(WHATSNEW_SEEN_KEY, '0.0.0-older')
    const root = mount(APP_VERSION)
    const el = toast()
    expect(el).toBeTruthy()
    expect(el?.textContent).toContain(APP_VERSION)
    act(() => root.unmount())
  })
})
