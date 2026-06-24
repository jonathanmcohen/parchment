'use client'

import { type RefObject, useEffect } from 'react'

// S2 (fix): the full WAI-ARIA menu-button keyboard model for the sidebar "+ New"
// mega-menu and the UserCluster account menu (the K3/G15 lesson). Both menus
// declare role="menu" / role="menuitem" / aria-haspopup="menu", so they MUST be
// keyboard-operable like a real menu — not just Escape + outside-click.
//
// This hook owns the in-menu keyboard model; `useMenuDismiss` still owns
// outside-click + the Escape→close→restore-focus path. Together they give:
//   • focus moved INTO the menu on open (first enabled item)
//   • ArrowDown / ArrowUp cycle items (wraparound)
//   • Home / End jump to first / last
//   • roving tabindex (only the focused item is tabbable; the rest are -1)
//   • a focus trap: Tab / Shift+Tab stay within the menu (do not escape to the
//     page); they advance/retreat through items and wrap, like the arrows
//   • Enter / Space activate (native <button> behavior — no extra wiring)
//   • Escape close + focus-restore to the trigger (via useMenuDismiss)
//
// No new feature logic — pure interaction wiring shared by both menus.
//
// `enabled` items are the non-disabled `[role="menuitem"]` descendants of the
// menu container. Disabled items (e.g. the "Switch account" placeholder) are
// skipped by roving focus so keyboard users never land on a dead control.
export function useMenuKeyboard(open: boolean, menuRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    if (!menu) return

    function items(): HTMLElement[] {
      if (!menu) return []
      return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true',
      )
    }

    // Roving tabindex: only the currently-focused item is tabbable.
    function setRoving(active: HTMLElement | null) {
      for (const el of items()) {
        el.tabIndex = el === active ? 0 : -1
      }
    }

    function focusAt(list: HTMLElement[], index: number) {
      if (list.length === 0) return
      const wrapped = ((index % list.length) + list.length) % list.length
      const target = list[wrapped]
      if (!target) return
      setRoving(target)
      target.focus()
    }

    // Move focus into the menu on open: first enabled item.
    const initial = items()
    for (const el of initial) el.tabIndex = -1
    const first = initial[0]
    if (first) {
      first.tabIndex = 0
      first.focus()
    }

    function currentIndex(list: HTMLElement[]): number {
      const idx = list.indexOf(document.activeElement as HTMLElement)
      return idx
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!menu) return
      // Only handle keys while focus is inside this menu.
      if (!menu.contains(document.activeElement)) return
      const list = items()
      if (list.length === 0) return

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          focusAt(list, currentIndex(list) + 1)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          focusAt(list, currentIndex(list) - 1)
          break
        }
        case 'Home': {
          e.preventDefault()
          focusAt(list, 0)
          break
        }
        case 'End': {
          e.preventDefault()
          focusAt(list, list.length - 1)
          break
        }
        case 'Tab': {
          // Trap: keep focus within the menu, advancing like the arrows so the
          // page content behind the open menu is never reachable by Tab.
          e.preventDefault()
          focusAt(list, currentIndex(list) + (e.shiftKey ? -1 : 1))
          break
        }
        // Enter / Space fall through to the native <button> activation; Escape
        // is owned by useMenuDismiss (close + restore focus to the trigger).
        default:
          break
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, menuRef])
}
