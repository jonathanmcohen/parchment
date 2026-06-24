'use client'

import { type RefObject, useEffect } from 'react'

// S2: shared dismiss behavior for the "+ New" mega-menu and the UserCluster
// account menu (the K3 lesson — keyboard-operable, Esc closes, focus restores
// to the trigger). Mirrors the established HelpMenu pattern so all three menus
// behave identically. No new feature logic; pure interaction wiring.
//
// - click outside the wrapper → close
// - Escape → close + return focus to the toggle
export function useMenuDismiss(
  open: boolean,
  close: () => void,
  wrapRef: RefObject<HTMLElement | null>,
  toggleRef: RefObject<HTMLButtonElement | null>,
): void {
  useEffect(() => {
    if (!open) return

    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        close()
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        toggleRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close, wrapRef, toggleRef])
}
