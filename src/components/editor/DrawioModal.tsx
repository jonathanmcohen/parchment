'use client'

import type { Editor } from '@tiptap/core'
import { useEffect, useId, useRef } from 'react'
import { drawioEmbedSrc, drawioEmbedUrl, parseDrawioExport } from '@/lib/editor/drawio'

/** Parse the origin from a URL string; returns null on invalid input. */
function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** Build the iframe src from the base URL; returns null on invalid input. */
function safeEmbedSrc(base: string): string | null {
  try {
    return drawioEmbedSrc(base)
  } catch {
    return null
  }
}

type Props = {
  editor: Editor
  /** Document position of the drawio node being edited. */
  pos: number
  /** The drawio node's current XML, used to seed the iframe. */
  initialXml: string
  onClose: () => void
}

/**
 * G6c: DrawioModal — drawio embed editor modal.
 *
 * When NEXT_PUBLIC_DRAWIO_EMBED_URL is unset, renders a muted disabled message
 * and a Close button — no iframe. When set, renders the drawio iframe and wires
 * the postMessage protocol:
 *   - init   → load current XML into drawio
 *   - save   → request SVG export
 *   - export → decode SVG, persist {xml, svg} via updateDrawio, close
 *   - exit   → close without saving
 *
 * SECURITY: all inbound messages are origin-checked against the configured embed
 * URL origin. Outbound postMessages target only that origin.
 */
export function DrawioModal({ editor, pos, initialXml, onClose }: Props) {
  const titleId = useId()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  // Use a ref so pendingXml survives effect re-runs without being a dep
  const pendingXmlRef = useRef<string>(initialXml)
  // Stable ref to onClose so it is not a dep that re-runs the effect
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  const base = drawioEmbedUrl()
  // Validate the base URL once; treat invalid as disabled
  const expectedOrigin = base ? safeOrigin(base) : null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  useEffect(() => {
    if (!base || !expectedOrigin) return

    // Seed pendingXml with the current initialXml each time the node changes
    pendingXmlRef.current = initialXml

    const handleMessage = (e: MessageEvent) => {
      // SECURITY: only process messages from the configured embed origin
      if (e.origin !== expectedOrigin) return
      // SECURITY: verify message comes from our iframe, not another same-origin window
      if (e.source !== iframeRef.current?.contentWindow) return

      let data: Record<string, unknown>
      try {
        data =
          typeof e.data === 'string'
            ? (JSON.parse(e.data) as Record<string, unknown>)
            : (e.data as Record<string, unknown>)
      } catch {
        return
      }

      const iframe = iframeRef.current
      const contentWindow = iframe?.contentWindow
      if (!contentWindow) return

      switch (data.event) {
        case 'init':
          // drawio is ready — load the current XML
          contentWindow.postMessage(
            JSON.stringify({ action: 'load', xml: pendingXmlRef.current }),
            expectedOrigin,
          )
          break

        case 'save': {
          // drawio has saved — capture the XML and request an SVG export
          const savedXml = typeof data.xml === 'string' ? data.xml : pendingXmlRef.current
          pendingXmlRef.current = savedXml
          contentWindow.postMessage(
            JSON.stringify({ action: 'export', format: 'xmlsvg' }),
            expectedOrigin,
          )
          break
        }

        case 'export': {
          // drawio returned the exported SVG data URI — decode and persist
          const dataUri = typeof data.data === 'string' ? data.data : ''
          const svg = parseDrawioExport(dataUri) ?? ''
          editor.commands.updateDrawio(pos, pendingXmlRef.current, svg)
          onCloseRef.current()
          break
        }

        case 'exit':
          // user closed without saving
          onCloseRef.current()
          break

        default:
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [base, editor, expectedOrigin, initialXml, pos])

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss on click is standard modal UX; keyboard close is handled by the inner dialog
    <div
      role="presentation"
      className="parchment-dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="parchment-dialog"
        style={{ width: '90vw', maxWidth: '90vw', height: '90vh' }}
        onKeyDown={handleKeyDown}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Drawio
          </h2>
          <button
            type="button"
            aria-label="Close Drawio editor"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {base === null || expectedOrigin === null ? (
          // Disabled state — no embed URL configured (or URL is invalid)
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'var(--page-ink-muted)', fontStyle: 'italic' }}>
              {base === null
                ? 'Drawio editing disabled — set NEXT_PUBLIC_DRAWIO_EMBED_URL'
                : 'Drawio editing disabled — NEXT_PUBLIC_DRAWIO_EMBED_URL is not a valid URL'}
            </p>
          </div>
        ) : (
          // Enabled state — render the embed iframe
          <iframe
            ref={iframeRef}
            src={safeEmbedSrc(base) ?? ''}
            title="Drawio diagram editor"
            style={{
              flex: 1,
              width: '100%',
              border: 'none',
              minHeight: 0,
              height: 'calc(90vh - 4rem)',
            }}
            allow="clipboard-read; clipboard-write"
          />
        )}

        {(base === null || expectedOrigin === null) && (
          <div className="parchment-dialog-actions">
            <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
