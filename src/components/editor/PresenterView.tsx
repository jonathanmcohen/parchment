'use client'

// G16: PresenterView — full-screen slideshow overlay.
//
// Opens on F5 (or toolbar button). Slides are split on top-level pageBreak
// nodes by splitIntoSlides(). Each slide's content is rendered read-only via
// renderReadOnlyDoc(). Speaker notes are shown in a muted strip below (they
// are extracted into slide.notes by splitIntoSlides and never appear in slide
// content). Keyboard nav: Arrow/Space/Enter/PageDown → next; Arrow/Backspace/
// PageUp → prev; Home/End → first/last; Esc/F5 → close. Stage click → next.
//
// FOCUS MANAGEMENT (G15 lesson): document.activeElement is captured on mount
// and restored on close so focus returns to the editor.
//
// FULLSCREEN: requestFullscreen is called on mount (guarded, failure silently
// ignored). exitFullscreen is called on unmount.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { renderReadOnlyDoc } from '@/components/share/render-pm'
import { splitIntoSlides } from '@/lib/editor/presenter'

type Props = {
  docJson: unknown
  onClose: () => void
}

export function PresenterView({ docJson, onClose }: Props) {
  const slides = splitIntoSlides(docJson)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [notesOpen, setNotesOpen] = useState(true)

  // Focus management — capture the element that was focused before the overlay
  // opened so we can restore it on close (G15 lesson).
  const previousFocusRef = useRef<Element | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Keep a stable ref to onClose so the keydown handler never stales.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const total = slides.length
  const slide = slides[Math.min(currentIndex, total - 1)]

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, total - 1))
  }, [total])

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0))
  }, [])

  const handleClose = useCallback(() => {
    onCloseRef.current()
  }, [])

  // Capture previous focus on mount; move focus into overlay.
  useLayoutEffect(() => {
    previousFocusRef.current = document.activeElement
    closeButtonRef.current?.focus()
  }, [])

  // Restore focus on unmount.
  useEffect(() => {
    return () => {
      const el = previousFocusRef.current
      if (el && 'focus' in el && typeof (el as HTMLElement).focus === 'function') {
        ;(el as HTMLElement).focus()
      }
    }
  }, [])

  // Request fullscreen on mount; exit on unmount.
  // requestFullscreen returns a Promise (Chrome 71+, Firefox 64+, Safari 16.4+).
  // Failure is reported as a rejected Promise — not a synchronous throw — so we
  // attach a no-op .catch() instead of relying on try/catch or void.
  useEffect(() => {
    const el = document.documentElement
    el.requestFullscreen?.().catch(() => {})
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {})
      }
    }
  }, [])

  // Keyboard handler attached to window while the overlay is open.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Guard: if focus has somehow escaped the overlay (e.g. OS accessibility
      // tool, browser chrome), do not intercept Space/Backspace/etc. globally.
      // Escape and F5 are always handled so the presenter can always be closed.
      const focusInOverlay = overlayRef.current?.contains(document.activeElement) ?? false
      if (!focusInOverlay && e.key !== 'Escape' && e.key !== 'F5') return

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
        case 'Enter':
          e.preventDefault()
          goNext()
          break
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'Backspace':
          e.preventDefault()
          goPrev()
          break
        case 'Home':
          e.preventDefault()
          setCurrentIndex(0)
          break
        case 'End':
          e.preventDefault()
          setCurrentIndex(total - 1)
          break
        case 'Escape':
          e.preventDefault()
          handleClose()
          break
        case 'F5':
          // F5 closes the presenter. The Editor.tsx handler is guarded to only
          // open (not toggle) when the presenter is already closed, so this is
          // the sole owner of F5 while the overlay is active.
          e.preventDefault()
          handleClose()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev, handleClose, total])

  const slideContent = {
    type: 'doc' as const,
    content: slide?.content ?? [],
  }

  // Unwrap speakerNote wrapper nodes: each speakerNote has inline* content.
  // We must not pass raw speakerNote nodes to renderReadOnlyDoc because
  // renderReadOnlyDoc → renderNodeWithCites hits `case 'speakerNote': return null`
  // (the public/share suppression), causing the notes panel to render blank.
  // Instead we extract the inner content arrays and present each as a paragraph
  // so the author's text is visible in the notes strip.
  const notesParagraphs = (slide?.notes ?? []).flatMap((noteNode) => {
    const inlineContent = (noteNode as { content?: Record<string, unknown>[] }).content ?? []
    return inlineContent.length > 0 ? [{ type: 'paragraph', content: inlineContent }] : []
  })

  const notesContent = {
    type: 'doc' as const,
    content: notesParagraphs,
  }

  const hasNotes = (slide?.notes.length ?? 0) > 0

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Presenter mode"
      className="parchment-presenter-overlay"
    >
      {/* ── Control bar ───────────────────────────────────────────────────── */}
      <div className="parchment-presenter-bar">
        <button
          type="button"
          className="parchment-presenter-nav"
          aria-label="Previous slide"
          onClick={goPrev}
          disabled={currentIndex === 0}
        >
          &larr;
        </button>

        {/* Slide counter — aria-live so screen readers announce slide changes. */}
        {/* biome-ignore format: keep counter attrs on one line for readability */}
        <span className="parchment-presenter-counter" aria-live="polite" aria-atomic="true">
          {currentIndex + 1} / {total}
        </span>

        <button
          type="button"
          className="parchment-presenter-nav"
          aria-label="Next slide"
          onClick={goNext}
          disabled={currentIndex === total - 1}
        >
          &rarr;
        </button>

        <button
          type="button"
          className="parchment-presenter-notes-toggle"
          aria-pressed={notesOpen}
          onClick={() => setNotesOpen((v) => !v)}
        >
          Notes
        </button>

        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close presenter mode"
          className="parchment-presenter-close"
          onClick={handleClose}
        >
          &times;
        </button>
      </div>

      {/* ── Slide stage — click to advance ───────────────────────────────── */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard nav handled by window listener */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click-to-advance UX; keyboard nav is on window */}
      <div className="parchment-presenter-stage" onClick={goNext}>
        <div className="parchment-presenter-slide">{renderReadOnlyDoc(slideContent)}</div>
      </div>

      {/* ── Speaker notes strip ───────────────────────────────────────────── */}
      {notesOpen && (
        <div className="parchment-presenter-notes-strip">
          {hasNotes ? (
            <div className="parchment-presenter-notes-content">
              {renderReadOnlyDoc(notesContent)}
            </div>
          ) : (
            <p className="parchment-presenter-notes-empty">No notes for this slide.</p>
          )}
        </div>
      )}
    </div>
  )
}
