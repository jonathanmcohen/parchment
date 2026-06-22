'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { useId, useRef, useState } from 'react'

/**
 * J1 CairnLinkView — the client NodeView for a `[[cairn://page-id]]` link. It
 * renders the link text and, on hover/focus, a PREVIEW CARD with the Cairn
 * page's title + excerpt.
 *
 * OFF-UNLESS-CONFIGURED: the card data comes from `/api/cairn/preview`, which
 * returns 204 (no body) when CAIRN_BASE_URL is unset — so when Cairn is not
 * configured NO card content is shown and the server makes NO external call.
 * The link still renders (non-navigable when there is no Cairn URL). The fetch
 * is deferred until first hover/focus, so simply rendering a doc never calls out.
 *
 * XSS-SAFE: title/excerpt are rendered as React text children (auto-escaped) —
 * never via dangerouslySetInnerHTML — so a hostile Cairn-returned title cannot
 * inject markup. The href is resolved server-side (cairnPageUrl validates the
 * pageId); here we only link to it with rel="noopener noreferrer".
 *
 * Reads ONLY its own attrs (pageId/label) — no useEditorState (the G7 lesson).
 */

type Preview = { title: string; excerpt: string }

export function CairnLinkView({ node }: NodeViewProps) {
  const pageId = String(node.attrs.pageId ?? '')
  const rawLabel = String(node.attrs.label ?? '')
  const label = rawLabel.length ? rawLabel : pageId

  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [href, setHref] = useState<string | null>(null)
  const fetchedRef = useRef(false)
  const cardId = useId()

  // Fetch the preview (url + title + excerpt) once, lazily, on first
  // hover/focus. The endpoint returns url:null + empty title/excerpt when Cairn
  // is disabled (NO external call was made server-side) — we then show no card
  // and a non-navigable link. Resilient: any error leaves preview null.
  const ensureFetched = () => {
    if (fetchedRef.current || !pageId) return
    fetchedRef.current = true
    fetch(`/api/cairn/preview?pageId=${encodeURIComponent(pageId)}`)
      .then(async (r) => {
        if (!r.ok) return
        const data = (await r.json()) as { url?: string | null; title?: string; excerpt?: string }
        if (typeof data.url === 'string') setHref(data.url)
        const title = typeof data.title === 'string' ? data.title : ''
        const excerpt = typeof data.excerpt === 'string' ? data.excerpt : ''
        if (title || excerpt) setPreview({ title, excerpt })
      })
      .catch(() => {
        /* off / unreachable — render just the (non-navigable) link, no card */
      })
  }

  const show = () => {
    ensureFetched()
    setOpen(true)
  }
  const hide = () => setOpen(false)

  const linkText = `[[cairn://${label}]]`

  return (
    <NodeViewWrapper
      as="span"
      className="parchment-cairn-link-view"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {href ? (
        <a
          data-cairn-link=""
          data-cairn-page={pageId}
          href={href}
          rel="noopener noreferrer"
          className="parchment-cairn-link"
          aria-describedby={preview ? cardId : undefined}
        >
          {linkText}
        </a>
      ) : (
        // No Cairn URL (CAIRN_BASE_URL unset / invalid id) → a non-navigable
        // trigger. A <button> (not a tabIndex'd span) keeps it keyboard-focusable
        // and accessible without an a11y violation; it has no click action (the
        // preview is shown on hover/focus via the wrapper handlers).
        <button
          type="button"
          data-cairn-link=""
          data-cairn-page={pageId}
          className="parchment-cairn-link parchment-cairn-link--unresolved"
          aria-describedby={preview ? cardId : undefined}
        >
          {linkText}
        </button>
      )}
      {open && preview && (
        <span id={cardId} role="tooltip" className="parchment-cairn-preview-card">
          {preview.title && <span className="parchment-cairn-preview-title">{preview.title}</span>}
          {preview.excerpt && (
            <span className="parchment-cairn-preview-excerpt">{preview.excerpt}</span>
          )}
        </span>
      )}
    </NodeViewWrapper>
  )
}
