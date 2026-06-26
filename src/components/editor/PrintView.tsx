'use client'

// H2 / v0.1.10 #13: Print / PDF overlay.
//
// Renders the document as REAL, content-split .parchment-page sheets (via
// PaginatedDocument) and prints those exact sheets through the browser's NATIVE
// @page pipeline. paged.js was removed entirely — under Turbopack it never
// produced page boxes (it always fell back), so it was dead weight; the native
// path already yields correct output and now also gets true per-page splitting.
//
// Rendered via ReactDOM.createPortal(…, document.body) so the overlay is a
// direct child of <body>. That is required for the @media print selectors in
// globals.css (`body > .parchment-print-overlay`, `body > *:not(…)`) to match
// and isolate the printable content.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PaginatedDocument } from '@/components/editor/PaginatedDocument'
import type { Orientation, PageSetup } from '@/lib/editor/paginate'
import type { PageOrientations } from '@/lib/editor/pagination'
import type { WatermarkConfig } from '@/lib/editor/watermark'
import { annotateDocWithShiki, EXPORT_STYLESHEET } from '@/lib/export/html'
import { pageCss } from '@/lib/export/page-css'

type Props = {
  content: unknown
  pageSetup: PageSetup
  /** Per-page orientation overrides (sparse; inherit-by-default). */
  pageOrientations?: PageOrientations
  /** Doc-level watermark painted behind each sheet. */
  watermark?: WatermarkConfig
  /** #11: flip a single page's orientation from the preview. */
  onSetPageOrientation?: (pageIndex: number, orientation: Orientation) => void
  onClose: () => void
}

export function PrintView({
  content,
  pageSetup,
  pageOrientations = [],
  watermark,
  onSetPageOrientation,
  onClose,
}: Props) {
  // #14: syntax-highlighted code blocks in print/PDF. Annotate the snapshot with
  // Shiki tokens (LIGHT github-light theme — reads on white paper) on mount;
  // until it resolves we render the raw doc (plaintext code), then swap in the
  // highlighted version. The annotated doc carries pre-built, escaped +
  // hex-color-validated `__exportHtml` attrs that render-pm only honours under
  // `exportHighlight: true`, so the XSS gate stays shut.
  const [annotatedContent, setAnnotatedContent] = useState<unknown>(content)
  // Until the first paginate measurement lands the page count is unknown; the
  // print button stays enabled (the sheets render correct content immediately).
  const [pageCount, setPageCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setAnnotatedContent(content)
    void annotateDocWithShiki(content).then((annotated) => {
      if (!cancelled) setAnnotatedContent(annotated)
    })
    return () => {
      cancelled = true
    }
  }, [content])

  // Focus management (G15 pattern): capture currently-focused element, move focus
  // into the dialog on mount, restore on unmount.
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    return () => {
      returnFocusRef.current?.focus()
    }
  }, [])

  // Esc closes + Tab focus trap (G15 pattern).
  useEffect(() => {
    const overlayEl = closeButtonRef.current?.closest('[role="dialog"]') as HTMLElement | null

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }

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

  // afterprint: close the overlay once the browser print dialog is dismissed.
  // Best-effort (not all browsers fire afterprint reliably).
  useEffect(() => {
    const handler = () => {
      onCloseRef.current()
    }
    window.addEventListener('afterprint', handler)
    return () => window.removeEventListener('afterprint', handler)
  }, [])

  // @page rule: marginless so the printable box is the FULL physical sheet — each
  // .parchment-paged-sheet supplies its own padding as the page margin (#13). The
  // size matches the document-default orientation; mixed per-page orientation
  // still shows correctly in the on-screen preview, but native print uses one
  // @page size for every page (a browser limitation we accept rather than fake).
  const printStyles = `${EXPORT_STYLESHEET}\n${pageCss(pageSetup, { marginless: true })}`

  const overlay = (
    <div
      className="parchment-print-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Print / PDF"
    >
      {/* ── Control bar (hidden during actual print via @media print) ── */}
      <div className="parchment-print-bar">
        <span className="parchment-print-title">Print / Save as PDF</span>

        <span className="parchment-print-status" aria-live="polite">
          {pageCount > 0 ? `${pageCount} page${pageCount === 1 ? '' : 's'}` : 'Laying out…'}
        </span>

        <button
          type="button"
          className="parchment-print-action"
          onClick={() => window.print()}
          aria-label="Print or save as PDF"
        >
          Print / Save as PDF
        </button>

        <button
          ref={closeButtonRef}
          type="button"
          className="parchment-print-close"
          aria-label="Close print view"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Export typography (bare element rules) + the marginless @page rule.
          The @page rule sets the printed page size to match the canvas; the
          element rules style the read-only content inside each sheet. */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted local stylesheet (EXPORT_STYLESHEET + pageCss) — no user-supplied HTML. */}
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />

      {/* The real, content-split sheets. This same DOM is what prints — globals.css
          hides every other body child during print and pagination.css flattens the
          on-screen gutter/shadow so each sheet maps to one physical page. */}
      <div className="parchment-print-sheets">
        <PaginatedDocument
          content={annotatedContent}
          pageSetup={pageSetup}
          pageOrientations={pageOrientations}
          {...(watermark ? { watermark } : {})}
          {...(onSetPageOrientation ? { onSetPageOrientation } : {})}
          exportHighlight
          onPageCountChange={setPageCount}
        />
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
