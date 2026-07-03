'use client'

import { type RefObject, useEffect } from 'react'
import { getFocusableElements, nextTrapIndex } from '@/lib/a11y/focus-trap'

// v0.2.10 mobile pass: shared modal-overlay behaviour for the off-canvas drawer
// (AppShell) and the toolbar `⋯` bottom sheet. Both are `aria-modal` surfaces that
// must (1) lock body scroll while open, (2) trap Tab focus, (3) move focus in on
// open and restore it to the trigger on close, and (4) close on Escape.
//
// The pure index math + the focusable-element query live in `@/lib/a11y/focus-trap`
// (unit-tested); this hook only wires them to the DOM + React lifecycle.

// A single, ref-counted body-scroll lock so nested/overlapping overlays (a sheet
// opened while the drawer is open, in theory) don't fight over the style. The lock
// pins the scroll position with position:fixed so background content can't scroll
// on touch (iOS ignores overflow:hidden on <body> for touch scrolling).
let lockCount = 0
let savedScrollY = 0

function lockBodyScroll() {
  lockCount += 1
  if (lockCount > 1) return
  savedScrollY = window.scrollY
  const { style } = document.body
  style.position = 'fixed'
  style.top = `-${savedScrollY}px`
  style.left = '0'
  style.right = '0'
  style.width = '100%'
}

function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount > 0) return
  const { style } = document.body
  style.position = ''
  style.top = ''
  style.left = ''
  style.right = ''
  style.width = ''
  // Restore the pinned scroll position. Guarded because jsdom's scrollTo is a
  // logging no-op; a try/catch keeps test output clean and is harmless in browsers.
  try {
    window.scrollTo(0, savedScrollY)
  } catch {
    // no-op: environment without a real scrollTo
  }
}

export type ModalOverlayOptions = {
  /** Whether the overlay is currently open. */
  open: boolean
  /** The overlay panel element (the focus-trap boundary). */
  panelRef: RefObject<HTMLElement | null>
  /** Called when Escape is pressed or focus should close the overlay. */
  onClose: () => void
  /**
   * Element to restore focus to on close (usually the trigger). When omitted, the
   * previously-focused element at open time is restored.
   */
  returnFocusRef?: RefObject<HTMLElement | null>
  /** Lock body scroll while open (default true). */
  lockScroll?: boolean
}

/**
 * Wire modal-overlay behaviour onto an open panel: body-scroll lock, focus-trap,
 * focus-in-on-open / restore-on-close, and Escape-to-close.
 */
export function useModalOverlay({
  open,
  panelRef,
  onClose,
  returnFocusRef,
  lockScroll = true,
}: ModalOverlayOptions): void {
  // Body-scroll lock (ref-counted).
  useEffect(() => {
    if (!open || !lockScroll) return
    lockBodyScroll()
    return () => unlockBodyScroll()
  }, [open, lockScroll])

  // Focus management + trap + Escape.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return

    // Remember what had focus so we can restore it on close.
    const previouslyFocused = (returnFocusRef?.current ??
      (document.activeElement as HTMLElement | null)) as HTMLElement | null

    // Move focus into the overlay: first focusable, else the panel itself.
    const initial = getFocusableElements(panel)
    const first = initial[0]
    if (first) {
      first.focus()
    } else if (panel.tabIndex >= 0) {
      panel.focus()
    }

    function onKeyDown(e: KeyboardEvent) {
      const el = panelRef.current
      if (!el) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key !== 'Tab') return
      const focusables = getFocusableElements(el)
      if (focusables.length === 0) {
        // Nothing to move to — keep focus on the panel, don't let it escape.
        e.preventDefault()
        return
      }
      const active = document.activeElement as HTMLElement | null
      const currentIndex = active ? focusables.indexOf(active) : -1
      const dest = nextTrapIndex(
        currentIndex,
        focusables.length,
        e.shiftKey ? 'backward' : 'forward',
      )
      const target = dest >= 0 ? focusables[dest] : undefined
      if (target) {
        e.preventDefault()
        target.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Restore focus to the trigger if it is still in the document.
      const target = returnFocusRef?.current ?? previouslyFocused
      if (target && document.contains(target)) {
        target.focus()
      }
    }
  }, [open, panelRef, onClose, returnFocusRef])
}
