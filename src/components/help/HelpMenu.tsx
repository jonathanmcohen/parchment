'use client'

// I9: Help menu — sidebar footer control that exposes three help dialogs:
//   1. Keyboard shortcuts (modal dialog)
//   2. What's new (modal dialog with release notes)
//   3. Welcome tour (multi-step modal, auto-shown once via localStorage flag,
//      replayable from this menu)
//
// Focus management mirrors the G15 lesson from ReadingView/PresenterView:
//   - On open: save document.activeElement, move focus into dialog
//   - On close: restore focus to saved element
//   - Esc closes the open dialog
//   - Tab/Shift-Tab cycle is trapped within each dialog

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  registerShortcutAction,
  SHORTCUT_EVENT,
  type ShortcutEventDetail,
} from '@/components/shortcuts/GlobalShortcuts'
import { RELEASE_NOTES, TOUR_STEPS } from '@/lib/help/content'
import {
  type Binding,
  DEFAULT_BINDINGS,
  mergeBindings,
  normalizeCombo,
  splitCombo,
} from '@/lib/help/keymap'

// ── Cheat-sheet key formatting ────────────────────────────────────────────────
//
// The persisted keymap stores normalized combos (e.g. `Mod-Shift-/`, `f5`). The
// cheat sheet renders a pretty form. On macOS `Mod` shows as ⌘, elsewhere Ctrl.

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)
}

/** Turn a normalized combo (e.g. `Mod-Shift-/`) into a display string. */
export function formatCombo(combo: string, mac: boolean): string {
  // splitCombo decomposes robustly so a `-`/`+` key (finding E) isn't lost by a
  // naive split('-').
  const { mods, key } = splitCombo(normalizeCombo(combo))
  const pretty: string[] = []
  if (mods.has('Mod')) pretty.push(mac ? '⌘' : 'Ctrl')
  if (mods.has('Shift')) pretty.push(mac ? '⇧' : 'Shift')
  if (mods.has('Alt')) pretty.push(mac ? '⌥' : 'Alt')
  const sep = mac ? '' : '+'
  return [...pretty, key.toUpperCase()].join(sep)
}

// ── localStorage helpers (guarded + try/catch) ───────────────────────────────

const TOUR_SEEN_KEY = 'parchment:tour-seen'

function getTourSeen(): boolean {
  if (typeof window === 'undefined') return true // SSR guard
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === 'true'
  } catch {
    return true // if storage is unavailable, don't auto-show
  }
}

function setTourSeen(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TOUR_SEEN_KEY, 'true')
  } catch {
    // quota exceeded or private mode — silent
  }
}

// ── Focus-trap hook ───────────────────────────────────────────────────────────
//
// Uses the G15 mount/unmount pattern (mirrors ReadingView.tsx lines 107-113):
//   - On mount: save activeElement, focus first focusable inside container.
//   - On unmount cleanup: restore focus to saved element (WCAG 2.4.3).
// Esc and Tab-trap run for the lifetime of the mounted dialog (no isOpen toggle).

function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  // WCAG 2.4.3 / G15: explicit restore target. The dropdown menuitem that opened
  // the dialog is unmounted in the SAME React commit that mounts the dialog, so by
  // the time this effect reads document.activeElement it is already <body>. We must
  // be handed the durable trigger (the Help toggle button) to restore focus to it.
  restoreRef?: React.RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const restoreRefRef = useRef(restoreRef)
  restoreRefRef.current = restoreRef

  // On mount: save previous focus + move focus into dialog.
  // On unmount: restore focus to saved element (WCAG 2.4.3).
  useLayoutEffect(() => {
    // Prefer the explicit restore target (the trigger). Fall back to whatever was
    // focused at mount only when no trigger is provided (e.g. the auto-shown tour).
    const explicit = restoreRefRef.current?.current ?? null
    const previous = explicit ?? (document.activeElement as HTMLElement | null)
    const first = containerRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    first?.focus()
    return () => {
      // Read the trigger again at close time in case it remounted; fall back to the
      // value captured at open.
      const target = restoreRefRef.current?.current ?? previous
      target?.focus()
    }
  }, [containerRef])

  // Esc to close + Tab focus trap — active for the lifetime of the dialog.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }

      if (e.key === 'Tab' && containerRef.current) {
        const focusable = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0)

        if (focusable.length === 0) {
          e.preventDefault()
          return
        }

        const first = focusable[0] as HTMLElement
        const last = focusable[focusable.length - 1] as HTMLElement

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [containerRef])
}

// ── Shared Backdrop — wraps each dialog ──────────────────────────────────────

// The backdrop is a presentation layer; Esc is handled by useFocusTrap on the
// document. The only interactive surface is click-outside-to-close on the outer
// div — keyboard users are served by the focus trap + Esc inside the dialog.
function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc is handled by useFocusTrap on the document; click-outside closes
    // biome-ignore lint/a11y/noStaticElementInteractions: presentation backdrop — inner dialog carries all a11y roles
    <div
      className="parchment-help-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>
  )
}

// ── Shortcuts dialog ──────────────────────────────────────────────────────────

// Reference rows that are NOT part of the remappable keymap (editor-context
// triggers and Tiptap list/save keys) but belong on the cheat sheet so it stays
// a complete reference. Display strings only; not customizable.
const STATIC_REFERENCE: { keys: string; label: string }[] = [
  { keys: '⌘S', label: 'Note (autosaves continuously)' },
  { keys: '/', label: 'Open slash-command menu (at line start)' },
  { keys: '[[', label: 'Insert wiki link' },
  { keys: '@', label: 'Insert citation / @-mention' },
  { keys: 'Tab', label: 'Indent list item' },
  { keys: '⇧Tab', label: 'Outdent list item' },
]

function ShortcutsDialog({
  bindings,
  onClose,
  restoreRef,
}: {
  bindings: Binding[]
  onClose: () => void
  restoreRef?: React.RefObject<HTMLElement | null>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, onClose, restoreRef)
  const mac = useMemo(() => isMac(), [])

  return (
    <Backdrop onClose={onClose}>
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="parchment-help-dialog"
      >
        <div className="parchment-help-dialog-header">
          <h2 className="parchment-help-dialog-title">Keyboard shortcuts</h2>
          <button
            type="button"
            aria-label="Close shortcuts"
            className="parchment-help-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="parchment-help-dialog-body">
          <table className="parchment-shortcuts-table">
            <tbody>
              {bindings.map((b) => (
                <tr key={b.action}>
                  <td className="parchment-shortcut-keys">
                    <kbd>{formatCombo(b.defaultKeys, mac)}</kbd>
                  </td>
                  <td className="parchment-shortcut-label">{b.label}</td>
                </tr>
              ))}
              {STATIC_REFERENCE.map((s) => (
                <tr key={s.keys}>
                  <td className="parchment-shortcut-keys">
                    <kbd>{s.keys}</kbd>
                  </td>
                  <td className="parchment-shortcut-label">{s.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Backdrop>
  )
}

// ── What's new dialog ─────────────────────────────────────────────────────────

function WhatsNewDialog({
  onClose,
  restoreRef,
}: {
  onClose: () => void
  restoreRef?: React.RefObject<HTMLElement | null>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, onClose, restoreRef)

  return (
    <Backdrop onClose={onClose}>
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="What's new"
        className="parchment-help-dialog"
      >
        <div className="parchment-help-dialog-header">
          <h2 className="parchment-help-dialog-title">
            {"What's new"} <span className="parchment-help-version">v{RELEASE_NOTES.version}</span>
          </h2>
          <button
            type="button"
            aria-label="Close what's new"
            className="parchment-help-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="parchment-help-dialog-body">
          <ul className="parchment-release-list">
            {RELEASE_NOTES.highlights.map((h) => (
              <li key={h} className="parchment-release-item">
                {h}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Backdrop>
  )
}

// ── Tour modal ────────────────────────────────────────────────────────────────

function TourModal({
  onClose,
  restoreRef,
}: {
  onClose: () => void
  restoreRef?: React.RefObject<HTMLElement | null>
}) {
  const [step, setStep] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const total = TOUR_STEPS.length
  const current = TOUR_STEPS[step]
  const isFirst = step === 0
  const isLast = step === total - 1

  // handleDone is the single exit path for ALL close actions (X, Done, Esc,
  // click-outside) so that parchment:tour-seen is always written.
  // useFocusTrap receives handleDone (not onClose) so the Esc path also writes
  // the seen flag before closing.
  function handleDone() {
    setTourSeen()
    onClose()
  }

  useFocusTrap(containerRef, handleDone, restoreRef)

  return (
    <Backdrop onClose={handleDone}>
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Welcome tour, step ${step + 1} of ${total}`}
        className="parchment-help-dialog parchment-tour-dialog"
      >
        <div className="parchment-help-dialog-header">
          <h2 className="parchment-help-dialog-title">{current?.title}</h2>
          <button
            type="button"
            aria-label="Close tour"
            className="parchment-help-close"
            onClick={handleDone}
          >
            ✕
          </button>
        </div>
        <div className="parchment-help-dialog-body">
          <p className="parchment-tour-body">{current?.body}</p>
        </div>
        <div className="parchment-tour-footer">
          <span className="parchment-tour-counter" aria-live="polite" aria-atomic="true">
            {step + 1} / {total}
          </span>
          <div className="parchment-tour-nav">
            {!isFirst && (
              <button
                type="button"
                className="parchment-tour-btn"
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                className="parchment-tour-btn parchment-tour-btn--primary"
                onClick={handleDone}
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                className="parchment-tour-btn parchment-tour-btn--primary"
                onClick={() => setStep((s) => s + 1)}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </Backdrop>
  )
}

// ── HelpMenu ──────────────────────────────────────────────────────────────────

type Dialog = 'shortcuts' | 'whats-new' | 'tour' | null

type HelpMenuProps = {
  /** I2: server-provided shortcut overrides; merged into the cheat sheet. */
  shortcutOverrides?: Record<string, string>
}

export function HelpMenu({ shortcutOverrides = {} }: HelpMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  // WCAG 2.4.3: only the dropdown-menuitem open path needs the toggle as the
  // restore anchor (the menuitem unmounts in the same commit as the dialog mounts,
  // so document.activeElement is already <body> by the time the trap saves it).
  // The global-chord and auto-shown-tour paths must restore to wherever the user
  // actually was, so they leave this null and let useFocusTrap fall back to the
  // activeElement it captured at mount.
  const restoreOnClose = useRef<HTMLElement | null>(null)

  // I2: cheat-sheet bindings reflect the user's custom keys.
  const bindings = useMemo(
    () => mergeBindings(DEFAULT_BINDINGS, shortcutOverrides),
    [shortcutOverrides],
  )

  // Auto-show tour once on first visit (after mount, client-side only).
  useEffect(() => {
    if (!getTourSeen()) {
      setDialog('tour')
    }
  }, [])

  // I2 Part 1: the global ⌘⇧/ chord (owned by the GlobalShortcuts dispatcher,
  // remappable) opens the shortcuts cheat sheet from anywhere in the app.
  useEffect(() => {
    function handleShortcut(e: Event) {
      const detail = (e as CustomEvent<ShortcutEventDetail>).detail
      if (detail?.action === 'shortcuts-help') {
        // Global chord: restore focus to wherever the user was, not the toggle.
        restoreOnClose.current = null
        setMenuOpen(false)
        setDialog('shortcuts')
      }
    }
    window.addEventListener(SHORTCUT_EVENT, handleShortcut)
    // Finding C: register so the dispatcher intercepts the cheat-sheet combo
    // (⌘⇧/) wherever the HelpMenu is mounted (every app page).
    const unregister = registerShortcutAction('shortcuts-help')
    return () => {
      window.removeEventListener(SHORTCUT_EVENT, handleShortcut)
      unregister()
    }
  }, [])

  // Close dropdown menu when clicking outside.
  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  // Close dropdown on Esc (when no dialog is open).
  useEffect(() => {
    if (!menuOpen || dialog !== null) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenuOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen, dialog])

  function openDialog(d: Dialog) {
    // Opened from a dropdown menuitem: the menuitem unmounts in the same commit as
    // the dialog mounts, so capture the durable trigger now as the restore anchor.
    restoreOnClose.current = toggleRef.current
    setMenuOpen(false)
    setDialog(d)
  }

  function closeDialog() {
    setDialog(null)
  }

  return (
    <>
      <div ref={menuRef} className="parchment-help-menu-wrap">
        {/* S2-2: full-width help row — icon + label, matches the sidebar nav-row
            height and spacing so all footer rows feel visually cohesive. The
            aria-haspopup + aria-expanded expose the dropdown to AT. */}
        <button
          ref={toggleRef}
          type="button"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          className="parchment-footer-row"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px] leading-none">
            help
          </span>
          Help
        </button>

        {menuOpen && (
          <div className="parchment-help-dropdown px-menu">
            <button type="button" className="px-menu-item" onClick={() => openDialog('shortcuts')}>
              <span aria-hidden className="material-symbols-rounded px-menu-item-icon">
                keyboard
              </span>
              <span className="px-menu-item-label">Keyboard shortcuts</span>
            </button>
            <button type="button" className="px-menu-item" onClick={() => openDialog('whats-new')}>
              <span aria-hidden className="material-symbols-rounded px-menu-item-icon">
                new_releases
              </span>
              <span className="px-menu-item-label">{"What's new"}</span>
            </button>
            <button type="button" className="px-menu-item" onClick={() => openDialog('tour')}>
              <span aria-hidden className="material-symbols-rounded px-menu-item-icon">
                play_circle
              </span>
              <span className="px-menu-item-label">Replay tour</span>
            </button>
          </div>
        )}
      </div>

      {dialog === 'shortcuts' && (
        <ShortcutsDialog bindings={bindings} onClose={closeDialog} restoreRef={restoreOnClose} />
      )}
      {dialog === 'whats-new' && (
        <WhatsNewDialog onClose={closeDialog} restoreRef={restoreOnClose} />
      )}
      {dialog === 'tour' && <TourModal onClose={closeDialog} restoreRef={restoreOnClose} />}
    </>
  )
}
