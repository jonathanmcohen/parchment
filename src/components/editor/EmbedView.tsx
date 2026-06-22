'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { providerById, resolveProvider } from '@/lib/editor/embed-providers'

/**
 * J2 + J3: EmbedView — renders a read-only embed (calendar / spreadsheet) node.
 *
 * THE CRUX INVARIANT, enforced here: the iframe `src` is ALWAYS an allowlisted
 * https provider URL, or there is NO iframe. We call resolveProvider(url):
 *   - non-null → render a SANDBOXED iframe whose src is the DERIVED embedUrl
 *     (always https on the provider's own allowlisted host — see
 *     embed-providers.ts). We never put the raw node url into the iframe src.
 *   - null → render a click-to-open link card (the raw url shown, opened with
 *     rel="noopener noreferrer", target="_blank"). A malicious / arbitrary /
 *     non-allowlisted url can therefore NEVER become an iframe src.
 *
 * SANDBOX ATTRS (each justified):
 *   - allow-scripts: provider embeds (Google Calendar/Sheets, Airtable, Office)
 *     are interactive JS widgets; without it they render blank.
 *   - allow-same-origin: the provider's framed page must read its OWN cookies /
 *     origin storage to load a published doc. Combined with allow-scripts this
 *     is normally risky, but the framed origin is a fixed allowlisted provider
 *     host (never our own origin), so it cannot script the parent document.
 *   - allow-popups: provider "open in new tab" / auth popups must be permitted
 *     for the read-only view to function.
 *   NOT granted: allow-top-navigation (would let the frame redirect the whole
 *   tab — clickjacking/phishing vector) and allow-forms (read-only embeds do
 *   not need to submit forms; withholding it shrinks the attack surface).
 *   referrerpolicy="no-referrer" — do not leak the document URL to the provider.
 *   loading="lazy" — defer offscreen embeds.
 *
 * Reads ONLY its own attrs (provider/url/title), so plain NodeViewProps are
 * sufficient — no useEditorState needed (the G7 lesson).
 */

const SANDBOX = 'allow-scripts allow-same-origin allow-popups'

export function EmbedView({ node, getPos, editor }: NodeViewProps) {
  const url = typeof node.attrs.url === 'string' ? node.attrs.url : ''
  const title = typeof node.attrs.title === 'string' ? node.attrs.title : ''
  const providerId = typeof node.attrs.provider === 'string' ? node.attrs.provider : ''

  const resolved = url ? resolveProvider(url) : null
  // Caption: prefer the live-resolved provider label, fall back to the stored id.
  const providerLabel = resolved?.provider.label ?? providerById(providerId)?.label ?? ''
  const iframeTitle = title || (providerLabel ? `${providerLabel} embed` : 'Embedded content')

  const openEditor = () => {
    if (typeof getPos !== 'function') return
    const pos = getPos()
    if (pos === undefined) return
    editor.view.dom.dispatchEvent(
      new CustomEvent('parchment:edit-embed', {
        bubbles: true,
        detail: { pos, provider: providerId, url, title },
      }),
    )
  }

  // ── Empty (just inserted, no url yet) ──────────────────────────────────────
  if (!url) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <button
          type="button"
          onClick={openEditor}
          style={{
            display: 'block',
            width: '100%',
            padding: '2rem',
            textAlign: 'center',
            cursor: 'pointer',
            border: '2px dashed #ccc',
            borderRadius: '4px',
            background: 'none',
            color: '#999',
          }}
        >
          Empty embed — click to add a calendar or spreadsheet URL
        </button>
      </NodeViewWrapper>
    )
  }

  // ── Allowlisted provider → sandboxed iframe ────────────────────────────────
  if (resolved) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <figure style={{ margin: 0, position: 'relative' }} aria-label={iframeTitle}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              // Fixed aspect-ratio box (16:9) keeps layout stable while the
              // provider content loads lazily.
              aspectRatio: '16 / 9',
              border: '1px solid #e2e2e2',
              borderRadius: '6px',
              overflow: 'hidden',
              background: '#fafafa',
            }}
          >
            <iframe
              src={resolved.embedUrl}
              title={iframeTitle}
              sandbox={SANDBOX}
              referrerPolicy="no-referrer"
              loading="lazy"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 'none',
              }}
            />
          </div>
          <figcaption
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              marginTop: '0.35rem',
              fontSize: '0.8rem',
              color: '#666',
            }}
          >
            <span>
              {providerLabel}
              {title ? ` — ${title}` : ''}
            </span>
            <button
              type="button"
              onClick={openEditor}
              style={{
                border: '1px solid #ddd',
                borderRadius: '4px',
                background: '#fff',
                cursor: 'pointer',
                padding: '0.1rem 0.5rem',
                fontSize: '0.75rem',
                color: '#444',
              }}
            >
              Edit
            </button>
          </figcaption>
        </figure>
      </NodeViewWrapper>
    )
  }

  // ── Non-allowlisted url → safe click-to-open link card (NEVER an iframe) ────
  return (
    <NodeViewWrapper contentEditable={false}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.85rem 1rem',
          border: '1px solid #e2e2e2',
          borderRadius: '6px',
          background: '#fafafa',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#333' }}>
            {title || 'External link'}
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.8rem',
              color: '#0b6bcb',
            }}
          >
            {url}
          </a>
          <div style={{ fontSize: '0.72rem', color: '#999', marginTop: '0.2rem' }}>
            Not an embeddable provider — opens in a new tab.
          </div>
        </div>
        <button
          type="button"
          onClick={openEditor}
          style={{
            flexShrink: 0,
            border: '1px solid #ddd',
            borderRadius: '4px',
            background: '#fff',
            cursor: 'pointer',
            padding: '0.2rem 0.6rem',
            fontSize: '0.75rem',
            color: '#444',
          }}
        >
          Edit
        </button>
      </div>
    </NodeViewWrapper>
  )
}
