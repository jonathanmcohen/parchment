'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { newDocument } from '@/app/(app)/files/actions'
import { useMenuDismiss } from './use-menu-dismiss'
import { useMenuKeyboard } from './use-menu-keyboard'

// S2-1: the "+ New" button + 4-row mega-menu (Drive shape).
//
// Surfaces EXISTING actions only — no new create / folder / upload logic:
//   • Blank document → the existing `newDocument` server action (the same
//     create-doc call the files page "+ New document" form already uses).
//   • From template  → navigate /templates (existing route).
//   • Folder         → /files?new=folder → FileManager invokes its existing
//     new-folder handler (the SAME `?param` surfacing pattern as `?view=`; no
//     new folder logic is authored here).
//   • Upload         → /files?new=upload → FileManager opens its existing
//     import file picker (`/api/docs/import`; no uploader authored here).
//
// Copy strings are passed in (resolved server-side via getTranslations so the
// menu is localized). The menu is a flat surface in S2; its drop-shadow
// elevation is owned by S5-3 (the shared `.px-menu` shell + --shadow-dropdown).
// Keyboard-operable with Esc + focus-restore (the K3 lesson).
export function NewMenu({
  labels,
}: {
  labels: {
    new: string
    blankDocument: string
    fromTemplate: string
    folder: string
    upload: string
  }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useMenuDismiss(open, () => setOpen(false), wrapRef, toggleRef)
  // Full WAI-ARIA menu keyboard model: focus into menu on open, Arrow/Home/End
  // navigation, roving tabindex, Tab-trap (the K3/G15 lesson).
  useMenuKeyboard(open, menuRef)

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  // Open with the keyboard (Enter/Space activate the button → toggle below) but
  // also let ArrowDown/ArrowUp on the closed trigger open + focus the menu.
  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setOpen(true)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={toggleRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="parchment-new-btn w-full"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        {/* Multicolor Docs-style plus (the 4 Google colors), not single-color
            brand blue — each arm/segment is its own hue. Decorative. */}
        {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative glyph, aria-hidden; the button's text label names it */}
        <svg
          aria-hidden
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0"
        >
          <rect x="8.75" y="3" width="2.5" height="6" rx="1" fill="#EA4335" />
          <rect x="11" y="8.75" width="6" height="2.5" rx="1" fill="#FBBC04" />
          <rect x="8.75" y="11" width="2.5" height="6" rx="1" fill="#34A853" />
          <rect x="3" y="8.75" width="6" height="2.5" rx="1" fill="#4285F4" />
        </svg>
        {labels.new}
      </button>

      {open && (
        // Flat in S2; S5-3 adopts the shared `.px-menu` elevation shell.
        <div
          ref={menuRef}
          role="menu"
          aria-label={labels.new}
          className="parchment-new-menu absolute start-0 top-[calc(100%+8px)] z-20 flex min-w-[224px] flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1"
        >
          {/* Blank document — existing server action (same call as the files form).
              menuitems start at tabIndex -1; useMenuKeyboard rolls focus. */}
          <form action={newDocument} role="none">
            <button type="submit" role="menuitem" tabIndex={-1} className="parchment-new-menuitem">
              <span aria-hidden className="material-symbols-rounded text-[20px]">
                description
              </span>
              {labels.blankDocument}
            </button>
          </form>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="parchment-new-menuitem"
            onClick={() => go('/templates')}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              grid_view
            </span>
            {labels.fromTemplate}
          </button>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="parchment-new-menuitem"
            onClick={() => go('/files?new=folder')}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              create_new_folder
            </span>
            {labels.folder}
          </button>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="parchment-new-menuitem"
            onClick={() => go('/files?new=upload')}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              upload
            </span>
            {labels.upload}
          </button>
        </div>
      )}
    </div>
  )
}
