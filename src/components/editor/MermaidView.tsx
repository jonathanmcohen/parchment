'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'

/**
 * G6a: MermaidView — renders a mermaid diagram node inside the editor.
 *
 * Lazy-imports mermaid (client-only) on mount and whenever the source changes,
 * renders to SVG, then displays as a data-URI <img> (XSS-safe: SVG-in-img
 * cannot execute scripts — mirrors DrawingView's approach for defense-in-depth).
 *
 * Does NOT import mermaid at module load — this keeps getSchema(baseExtensions)
 * buildable in the server runtime without loading a window-dependent lib.
 *
 * Unique render IDs use a module-level incrementing counter (not Math.random)
 * to avoid SSR complications.
 */

let _renderCounter = 0
function nextRenderId(): string {
  _renderCounter += 1
  return `parchment-mermaid-${_renderCounter}`
}

export function MermaidView({ node, getPos, editor }: NodeViewProps) {
  const source = typeof node.attrs.source === 'string' ? node.attrs.source : ''
  const renderIdRef = useRef(nextRenderId())

  const [svgDataUri, setSvgDataUri] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSvgDataUri(null)
    setErrorText(null)

    if (!source.trim()) return

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
        const { svg } = await mermaid.render(renderIdRef.current, source)
        if (!cancelled) {
          setSvgDataUri(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
        }
      } catch (err) {
        if (!cancelled) {
          setErrorText(err instanceof Error ? err.message : String(err))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [source])

  const handleClick = () => {
    if (typeof getPos !== 'function') return
    const pos = getPos()
    if (pos === undefined) return
    editor.view.dom.dispatchEvent(
      new CustomEvent('parchment:edit-mermaid', {
        bubbles: true,
        detail: { pos, source },
      }),
    )
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      {!source.trim() ? (
        <button
          type="button"
          onClick={handleClick}
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
          Empty diagram — click to edit
        </button>
      ) : errorText !== null ? (
        // biome-ignore lint/a11y/useKeyWithClickEvents: diagram block is a mouse-driven atom; keyboard access via editor node selection
        // biome-ignore lint/a11y/noStaticElementInteractions: diagram block is a mouse-driven atom; keyboard access via editor node selection
        <div
          onClick={handleClick}
          style={{
            padding: '1rem',
            background: '#fff8f8',
            border: '1px solid #fcc',
            borderRadius: '4px',
            cursor: 'pointer',
            color: '#c00',
            fontFamily: 'monospace',
            fontSize: '0.85em',
            whiteSpace: 'pre-wrap',
          }}
        >
          {errorText}
        </div>
      ) : svgDataUri !== null ? (
        // biome-ignore lint/a11y/useKeyWithClickEvents: diagram block is a mouse-driven atom; keyboard access via editor node selection
        // biome-ignore lint/performance/noImgElement: SVG data-URI cannot use next/image (no src optimization applies to inline data URIs); this is the XSS-safe rendering path for owner-authored SVG
        <img
          src={svgDataUri}
          alt="Mermaid diagram"
          style={{ maxWidth: '100%', cursor: 'pointer', display: 'block' }}
          onClick={handleClick}
        />
      ) : (
        // Rendering in progress — show the source as a subtle placeholder
        <div
          style={{
            padding: '1rem',
            background: '#f9f9f9',
            border: '1px solid #eee',
            borderRadius: '4px',
            color: '#999',
            fontFamily: 'monospace',
            fontSize: '0.85em',
          }}
        >
          {source}
        </div>
      )}
    </NodeViewWrapper>
  )
}
