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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RELEASE_NOTES, SHORTCUTS, TOUR_STEPS } from '@/lib/help/content'

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

function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
) {
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Capture previous focus on open; move focus into container.
  useLayoutEffect(() => {
    if (!isOpen) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    // Focus the first focusable element inside the container.
    const first = containerRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    first?.focus()
  }, [isOpen, containerRef])

  // Restore focus on close.
  useEffect(() => {
    if (isOpen) return
    previousFocusRef.current?.focus()
    previousFocusRef.current = null
  }, [isOpen])

  // Esc to close + Tab focus trap.
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
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
  }, [isOpen, onClose, containerRef])
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

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const stableClose = useCallback(() => onCloseRef.current(), [])
  useFocusTrap(containerRef, true, stableClose)

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
              {SHORTCUTS.map((s) => (
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

function WhatsNewDialog({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const stableClose = useCallback(() => onCloseRef.current(), [])
  useFocusTrap(containerRef, true, stableClose)

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

function TourModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const stableClose = useCallback(() => onCloseRef.current(), [])
  useFocusTrap(containerRef, true, stableClose)

  const total = TOUR_STEPS.length
  const current = TOUR_STEPS[step]
  const isFirst = step === 0
  const isLast = step === total - 1

  function handleDone() {
    setTourSeen()
    onClose()
  }

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

export function HelpMenu() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // Auto-show tour once on first visit (after mount, client-side only).
  useEffect(() => {
    if (!getTourSeen()) {
      setDialog('tour')
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
    setMenuOpen(false)
    setDialog(d)
  }

  function closeDialog() {
    setDialog(null)
  }

  return (
    <>
      <div ref={menuRef} className="parchment-help-menu-wrap">
        <button
          ref={toggleRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Help menu"
          className="rounded-md px-2 py-1.5 text-left text-[var(--foreground)] text-sm hover:bg-[var(--background)]"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ? Help
        </button>

        {menuOpen && (
          <div role="menu" aria-label="Help options" className="parchment-help-dropdown">
            <button
              type="button"
              role="menuitem"
              className="parchment-help-menuitem"
              onClick={() => openDialog('shortcuts')}
            >
              Keyboard shortcuts
            </button>
            <button
              type="button"
              role="menuitem"
              className="parchment-help-menuitem"
              onClick={() => openDialog('whats-new')}
            >
              {"What's new"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="parchment-help-menuitem"
              onClick={() => openDialog('tour')}
            >
              Replay tour
            </button>
          </div>
        )}
      </div>

      {dialog === 'shortcuts' && <ShortcutsDialog onClose={closeDialog} />}
      {dialog === 'whats-new' && <WhatsNewDialog onClose={closeDialog} />}
      {dialog === 'tour' && <TourModal onClose={closeDialog} />}
    </>
  )
}
