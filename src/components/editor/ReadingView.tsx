'use client'

// G15: Reading mode overlay — full-screen, read-only, distraction-free view.
// Reuses renderReadOnlyDoc (static PM-JSON→React, no editor, XSS-safe).
// Three independent toggles: sepia (warm bg), serif (body font), wide-margin
// (narrower text column = wider margins). Prefs in localStorage (global);
// bookmark (scroll position) per-doc. Esc closes; role=dialog aria-modal.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CustomCssStyle } from '@/components/editor/CustomCssStyle'
import { renderReadOnlyDoc } from '@/components/share/render-pm'
import { CUSTOM_CSS_SCOPE } from '@/lib/editor/custom-css'
import {
  DEFAULT_READING_PREFS,
  parseReadingPrefs,
  type ReadingPrefs,
  readingBookmarkKey,
  readingClassNames,
  readingPrefsKey,
} from '@/lib/editor/reading'

type Props = {
  content: unknown
  docId: string
  /** G17: raw custom CSS from doc meta — sanitized+scoped at render. */
  customCss?: string
  onClose: () => void
}

// ── localStorage helpers (guarded + try/catch per brief requirement) ─────────

function loadPrefs(): ReadingPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_READING_PREFS }
  try {
    const raw = localStorage.getItem(readingPrefsKey())
    if (raw === null) return { ...DEFAULT_READING_PREFS }
    return parseReadingPrefs(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_READING_PREFS }
  }
}

function savePrefs(prefs: ReadingPrefs): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(readingPrefsKey(), JSON.stringify(prefs))
  } catch {
    // quota exceeded or private mode — silent
  }
}

function loadBookmark(docId: string): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(readingBookmarkKey(docId))
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function saveBookmark(docId: string, scrollTop: number): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(readingBookmarkKey(docId), String(scrollTop))
  } catch {
    // quota exceeded or private mode — silent
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function ReadingView({ content, docId, customCss = '', onClose }: Props) {
  const [prefs, setPrefs] = useState<ReadingPrefs>(() => loadPrefs())
  const scrollRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  // Keep a stable ref to the latest onClose so the keydown handler never stales.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Debounce timer for bookmark saves.
  const bookmarkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore bookmark after first paint.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const bookmark = loadBookmark(docId)
    if (bookmark === null) return
    // Use rAF so the browser has painted the content before we scroll.
    const id = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = bookmark
      }
    })
    return () => cancelAnimationFrame(id)
  }, [docId])

  // Capture the element that had focus before the dialog opened so we can
  // restore it when the dialog closes (WCAG 2.4.3 / spec "return focus on close").
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // On mount: save the currently focused element, then move focus into the dialog.
  // On unmount: restore focus to the saved element.
  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    return () => {
      returnFocusRef.current?.focus()
    }
  }, [])

  // Esc closes + Tab/Shift-Tab focus trap.
  useEffect(() => {
    const overlayEl = closeButtonRef.current?.closest('[role="dialog"]') as HTMLElement | null

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }

      // Focus trap: keep Tab cycle inside the dialog.
      if (e.key === 'Tab' && overlayEl) {
        const focusable = Array.from(
          overlayEl.querySelectorAll<HTMLElement>(
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
  }, [])

  // Save bookmark on scroll (debounced ~300 ms).
  const handleScroll = useCallback(() => {
    if (bookmarkTimer.current) clearTimeout(bookmarkTimer.current)
    bookmarkTimer.current = setTimeout(() => {
      if (scrollRef.current) {
        saveBookmark(docId, scrollRef.current.scrollTop)
      }
    }, 300)
  }, [docId])

  // Cleanup debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (bookmarkTimer.current) clearTimeout(bookmarkTimer.current)
    }
  }, [])

  const togglePref = useCallback((key: keyof ReadingPrefs) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      savePrefs(next)
      return next
    })
  }, [])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc is handled via document keydown; clicking the backdrop should close
    <div
      className="parchment-reading-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Reading mode"
      onClick={(e) => {
        // Close when clicking the backdrop (outside the content area).
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* ── Control bar ─────────────────────────────────────────────── */}
      <div className="parchment-reading-bar" role="toolbar" aria-label="Reading options">
        <button
          type="button"
          className={`parchment-reading-opt${prefs.sepia ? ' parchment-reading-opt--active' : ''}`}
          aria-pressed={prefs.sepia}
          onClick={() => togglePref('sepia')}
        >
          Sepia
        </button>
        <button
          type="button"
          className={`parchment-reading-opt${prefs.serif ? ' parchment-reading-opt--active' : ''}`}
          aria-pressed={prefs.serif}
          onClick={() => togglePref('serif')}
        >
          Serif
        </button>
        <button
          type="button"
          className={`parchment-reading-opt${prefs.wide ? ' parchment-reading-opt--active' : ''}`}
          aria-pressed={prefs.wide}
          onClick={() => togglePref('wide')}
          title="Wide margin (narrower text column)"
        >
          Wide
        </button>

        <button
          ref={closeButtonRef}
          type="button"
          className="parchment-reading-close"
          aria-label="Close reading mode"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* ── Scrollable reading area ─────────────────────────────────── */}
      {/* G17: scope class wraps doc content only; CustomCssStyle injects scoped style. */}
      <div
        ref={scrollRef}
        className={`${readingClassNames(prefs)} ${CUSTOM_CSS_SCOPE}`}
        onScroll={handleScroll}
      >
        <CustomCssStyle css={customCss} />
        {renderReadOnlyDoc(content)}
      </div>
    </div>
  )
}
