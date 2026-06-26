'use client'

import { type RefObject, useEffect } from 'react'

// S2: shared dismiss behavior for the "+ New" mega-menu and the UserCluster
// account menu (the K3 lesson — keyboard-operable, Esc closes, focus restores
// to the trigger). Mirrors the established HelpMenu pattern so all three menus
// behave identically. No new feature logic; pure interaction wiring.
//
// - click outside the wrapper → close
// - Escape → close + return focus to the toggle
//
// `extraInsideRef` (optional): a node that counts as "inside" for the
// outside-click test even though it is NOT a DOM descendant of `wrapRef`. The
// shared editor `Menu` portals its OPEN panel to a body-level overlay root
// (v0.1.9 #1) so it escapes the toolbar's overflow clip; a click on that
// portalled panel must therefore NOT dismiss the menu.
export function useMenuDismiss(
  open: boolean,
  close: () => void,
  wrapRef: RefObject<HTMLElement | null>,
  toggleRef: RefObject<HTMLButtonElement | null>,
  extraInsideRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return

    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node
      const insideWrap = wrapRef.current?.contains(target) ?? false
      const insideExtra = extraInsideRef?.current?.contains(target) ?? false
      if (!insideWrap && !insideExtra) {
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
  }, [open, close, wrapRef, toggleRef, extraInsideRef])
}
