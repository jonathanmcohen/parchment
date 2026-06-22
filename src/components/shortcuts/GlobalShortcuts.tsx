'use client'

// I2 — central global-shortcut dispatcher.
//
// Mounted once in the app layout. Holds the merged app-level keymap
// (DEFAULT_BINDINGS + the owner's persisted overrides, passed as a prop from the
// server layout) and is the SINGLE owner of the `window` keydown listener for
// app-level shortcuts. On a match it:
//   1. preventDefault()s (so e.g. Mod-p doesn't open the browser print dialog,
//      Mod-Shift-/ doesn't trigger a browser shortcut),
//   2. dispatches a `parchment:shortcut` CustomEvent carrying the action id.
//
// Feature components (CommandPalette, FileFinder, HelpMenu, Editor presenter)
// listen for that event and act — so a user remap actually takes effect without
// each component re-binding raw keys. This replaces the per-component
// Cmd-K / Cmd-P / F5 listeners.
//
// TEXT-INPUT SAFETY: most app-level chords use Mod/Ctrl, which are safe to fire
// while typing. The only bare-key default is F5 (presenter) — also safe (not a
// text key). We therefore do NOT suppress chords while focused in an input; the
// brief explicitly notes Mod-Shift-/ must work globally. If a future binding
// were a bare printable key we would need a typing guard, but none is today.

import { useEffect, useMemo } from 'react'
import { type Binding, DEFAULT_BINDINGS, matchesCombo, mergeBindings } from '@/lib/help/keymap'

export const SHORTCUT_EVENT = 'parchment:shortcut'

/** Detail payload carried on the parchment:shortcut CustomEvent. */
export interface ShortcutEventDetail {
  action: string
}

/** Dispatch a shortcut action programmatically (used by the dispatcher + tests). */
export function dispatchShortcut(action: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ShortcutEventDetail>(SHORTCUT_EVENT, { detail: { action } }))
}

type Props = {
  /** Server-provided overrides map (action → normalized combo). */
  overrides?: Record<string, string>
}

export function GlobalShortcuts({ overrides = {} }: Props) {
  // DEFAULT_BINDINGS identity is module-constant, so the memo only recomputes
  // when the server-provided overrides change.
  const bindings: Binding[] = useMemo(() => mergeBindings(DEFAULT_BINDINGS, overrides), [overrides])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only the customizable app-level commands are dispatched here; the
      // read-only formatting rows are owned by Tiptap and never intercepted.
      for (const b of bindings) {
        if (!b.customizable) continue
        if (matchesCombo(e, b.defaultKeys)) {
          e.preventDefault()
          dispatchShortcut(b.action)
          return
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [bindings])

  return null
}
