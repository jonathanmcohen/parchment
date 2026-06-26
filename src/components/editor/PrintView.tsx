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

// 'ready'    = paged.js produced .pagedjs_page boxes (best-effort preview).
// 'fallback' = paged.js failed (it is fragile under bundlers — "s.call is not a
//   function"); we render the content directly and rely on the browser's NATIVE
//   print engine + the injected @page CSS to paginate. The PDF is still correct
//   (right page size/margins); only the in-app paged preview is missing.
type Status = 'loading' | 'ready' | 'fallback'

export function PrintView({ content, pageSetup, onClose }: Props) {
  const [status, setStatus] = useState<Status>('loading')

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
        // paged.js failed — fall back to native browser pagination (the injected
        // @page CSS still gives the correct page size/margins). Not an error state.
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[print] paged.js preview failed, using native print:', err)
        }
        setStatus('fallback')
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
      // #10 (v0.1.9): the @media print rules key off this so the NATIVE-print
      // fallback (paged.js failed → status!=='ready') prints the source content
      // instead of the empty paged.js pages container (which produced a blank PDF).
      data-print-status={status}
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

        {status === 'fallback' && (
          <span className="parchment-print-status" aria-live="polite">
            Using browser pagination
          </span>
        )}

        {/* Print button: only enabled when pagination is complete (status=ready).
            Printing during 'error' prints an empty render target; printing
            during 'loading' races the async pagination (issue 6). */}
        <button
          type="button"
          className="parchment-print-action"
          disabled={status === 'loading'}
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

      {/* @page size/margins + content styles. paged.js gets the same CSS, but
          this <style> ALSO drives the browser's native print (the fallback path):
          the @page rule sets the printed page size/margins to match the canvas. */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted local stylesheet (EXPORT_STYLESHEET + pageCss(pageSetup)) — no user-supplied HTML. */}
      <style dangerouslySetInnerHTML={{ __html: `${EXPORT_STYLESHEET}\n${pageCss(pageSetup)}` }} />

      {/* Source / native-print body. paged.js reads from here; it is ALSO the
          printable content for the fallback path. Visible + in document flow
          unless paged.js succeeded (status 'ready'), where the page boxes show. */}
      <div
        className="parchment-print-source"
        ref={sourceRef}
        style={
          status === 'ready'
            ? { display: 'none' }
            : // #10: in the native-print fallback the source IS the printable (and
              // on-screen preview) content — fully un-hide it (the base CSS keeps it
              // offscreen/hidden for the paged.js-reads-it case).
              {
                position: 'static',
                left: 'auto',
                top: 'auto',
                width: 'auto',
                height: 'auto',
                overflow: 'visible',
                visibility: 'visible',
                display: 'block',
              }
        }
      >
        <article className="parchment-export">{renderReadOnlyDoc(content)}</article>
      </div>

      {/* ── Paged.js render target — paginated .pagedjs_page boxes land here ── */}
      <div
        className="parchment-print-pages"
        ref={renderTargetRef}
        style={{ display: status === 'ready' ? 'block' : 'none' }}
      />
    </div>
  )

  return createPortal(overlay, document.body)
}
