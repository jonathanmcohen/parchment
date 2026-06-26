'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'

/**
 * G6c: DrawioView — read-only render of a drawio node inside the editor.
 *
 * Renders the stored SVG as a data-URI <img> (XSS-safe: SVG-in-img cannot
 * execute scripts). Clicking opens the Drawio modal via a CustomEvent
 * dispatched on the ProseMirror DOM, which Editor.tsx listens for and opens
 * DrawioModal. Does NOT import any drawio library — rendering is just the
 * stored SVG snapshot.
 */
export function DrawioView({ node, getPos, editor }: NodeViewProps) {
  const svg = typeof node.attrs.svg === 'string' ? node.attrs.svg : ''
  const xml = typeof node.attrs.xml === 'string' ? node.attrs.xml : ''

  const handleClick = () => {
    if (typeof getPos !== 'function') return
    const pos = getPos()
    if (pos === undefined) return
    editor.view.dom.dispatchEvent(
      new CustomEvent('parchment:edit-drawio', {
        bubbles: true,
        detail: { pos, xml },
      }),
    )
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      {svg ? (
        // biome-ignore lint/a11y/useKeyWithClickEvents: drawio block is a mouse-driven atom; keyboard access is provided by the editor's node selection + Enter-to-edit pattern
        // biome-ignore lint/performance/noImgElement: SVG data-URI cannot use next/image (no src optimization applies to inline data URIs); this is the XSS-safe rendering path for owner-authored SVG
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
          alt="Diagram"
          style={{ maxWidth: '100%', cursor: 'pointer', display: 'block' }}
          onClick={handleClick}
        />
      ) : (
        <button
          type="button"
          onClick={handleClick}
          style={{
            display: 'block',
            width: '100%',
            padding: '2rem',
            textAlign: 'center',
            cursor: 'pointer',
            border: '2px dashed var(--page-border)',
            borderRadius: '4px',
            background: 'none',
            color: 'var(--page-ink-muted)',
          }}
        >
          Empty diagram — click to edit
        </button>
      )}
    </NodeViewWrapper>
  )
}
