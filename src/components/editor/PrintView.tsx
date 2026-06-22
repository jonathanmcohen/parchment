'use client'

// H2: Print / PDF export overlay.
// Lazily loads paged.js (browser-only; needs `window`) via dynamic import —
// NEVER a static/module-level import so SSR and the build are never affected.
// Focus management and Esc handling mirror the G15/G16 overlay pattern.
//
// Rendered via ReactDOM.createPortal(…, document.body) so the overlay is a
// direct child of <body>. This is required for the @media print selectors in
// globals.css (`body > .parchment-print-overlay`, `body > *:not(…)`) to match.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { renderReadOnlyDoc } from '@/components/share/render-pm'
import type { PageSetup } from '@/lib/editor/paginate'
import { EXPORT_STYLESHEET } from '@/lib/export/html'
import { pageCss } from '@/lib/export/page-css'

type Props = {
  content: unknown
  pageSetup: PageSetup
  onClose: () => void
}

type Status = 'loading' | 'ready' | 'error'

export function PrintView({ content, pageSetup, onClose }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  // The hidden source container that we render the React tree into as HTML,
  // and the visible render target that paged.js will paginate into.
  const sourceRef = useRef<HTMLDivElement>(null)
  const renderTargetRef = useRef<HTMLDivElement>(null)

  // Focus management (G15 pattern): capture currently-focused element,
  // move focus into dialog on mount, restore on unmount.
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Store the Previewer instance so we can destroy it on cleanup to prevent
  // accumulating orphaned <style data-pagedjs-inserted-styles> in document.head
  // and pagesArea/pageTemplate DOM nodes on every open/close cycle (issue 4).
  const previewerRef = useRef<{
    polisher?: { destroy?: () => void }
    chunker?: { destroy?: () => void }
  } | null>(null)

  // On mount: save focus, move into dialog.
  // On unmount: restore saved focus.
  // The close button is never aria-hidden (the bar has no aria-hidden attribute),
  // so moving focus to it is always valid (issue 5).
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

  // Core: lazily import paged.js and paginate into the render target.
  // biome-ignore lint/correctness/useExhaustiveDependencies: content is a prop snapshot passed at open time; re-paginating when it changes is intentional.
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const source = sourceRef.current
      const renderTarget = renderTargetRef.current
      if (!source || !renderTarget) return

      try {
        // Dynamic import — paged.js accesses `window`; must NEVER be a static
        // module-level import (breaks SSR and Next.js build).
        const { Previewer } = await import('pagedjs')

        if (cancelled) return

        // Build the complete stylesheet: export body styles + @page rules.
        const stylesheet = `${EXPORT_STYLESHEET}\n${pageCss(pageSetup)}`

        // paged.js preview(content, stylesheets, renderTo):
        //   content     — the DOM node holding the source HTML (hidden offscreen)
        //   stylesheets — array of objects { url: cssString } or URLs to fetch.
        //                 Pass inline CSS as { 'about:blank': cssString } — the
        //                 object form tells paged.js to use the value as CSS text
        //                 rather than treating it as a URL to fetch (issue 3).
        //   renderTo    — the DOM node to paginate into
        const previewer = new Previewer()
        previewerRef.current = previewer as typeof previewerRef.current
        // paged.js polisher.add() accepts objects { url: cssText } as well as
        // URL strings, but the inferred TS types only declare string[]. Cast to
        // unknown[] to satisfy TypeScript while passing the object form at
        // runtime — confirmed safe by reading paged.esm.js:27500–27526.
        await previewer.preview(
          source,
          [{ 'about:blank': stylesheet }] as unknown as string[],
          renderTarget,
        )

        if (cancelled) return
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        setErrorMsg(msg)
        setStatus('error')
      }
    }

    void run()
    return () => {
      cancelled = true
      // Destroy the paged.js Previewer to remove the injected <style> element
      // and pagesArea/pageTemplate DOM nodes, preventing leaks on each
      // open/close cycle (issue 4).
      const p = previewerRef.current
      if (p) {
        try {
          p.polisher?.destroy?.()
        } catch {
          /* ignore */
        }
        try {
          p.chunker?.destroy?.()
        } catch {
          /* ignore */
        }
        previewerRef.current = null
      }
    }
  }, [content, pageSetup])

  // afterprint: optionally close the overlay once the browser print dialog
  // is dismissed. This is best-effort (not all browsers fire afterprint reliably).
  useEffect(() => {
    const handler = () => {
      onCloseRef.current()
    }
    window.addEventListener('afterprint', handler)
    return () => window.removeEventListener('afterprint', handler)
  }, [])

  // Render via createPortal so the overlay is a direct child of <body>.
  // This is required for the @media print CSS selectors in globals.css to match:
  //   `body > .parchment-print-overlay`  (show overlay during print)
  //   `body > *:not(.parchment-print-overlay)` (hide everything else)
  // Without the portal, the overlay is deeply nested inside the Next.js app
  // container and the selectors never fire, producing a blank printed page
  // (issues 1 & 2).
  const overlay = (
    <div
      className="parchment-print-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Print / PDF"
    >
      {/* ── Control bar (hidden during actual print via @media print) ── */}
      {/* No aria-hidden on the bar: the close button must always be focusable
          and announced by assistive technology (issue 5). The loading status
          is communicated via aria-live on the status span instead. */}
      <div className="parchment-print-bar">
        <span className="parchment-print-title">Print / Save as PDF</span>

        {status === 'loading' && (
          <span className="parchment-print-status" aria-live="polite">
            Preparing…
          </span>
        )}

        {status === 'error' && (
          <span className="parchment-print-status parchment-print-status--error" aria-live="polite">
            Preview failed — use browser print ({errorMsg})
          </span>
        )}

        {/* Print button: only enabled when pagination is complete (status=ready).
            Printing during 'error' prints an empty render target; printing
            during 'loading' races the async pagination (issue 6). */}
        <button
          type="button"
          className="parchment-print-action"
          disabled={status !== 'ready'}
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

      {/* ── Hidden source container — paged.js reads from here ── */}
      {/* Rendered offscreen (CSS: position:absolute; left:-9999px) */}
      <div className="parchment-print-source" aria-hidden="true" ref={sourceRef}>
        <article className="parchment-export">{renderReadOnlyDoc(content)}</article>
      </div>

      {/* ── Paged.js render target — paginated .pagedjs_page boxes land here ── */}
      <div className="parchment-print-pages" ref={renderTargetRef} />
    </div>
  )

  return createPortal(overlay, document.body)
}
