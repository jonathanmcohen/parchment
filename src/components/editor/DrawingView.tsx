'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'

/**
 * G5: DrawingView — read-only render of a drawing node inside the editor.
 *
 * Renders the stored SVG as a data-URI <img> (XSS-safe: SVG-in-img cannot
 * execute scripts). Clicking opens the Excalidraw modal via a CustomEvent
 * dispatched on the ProseMirror DOM, which Editor.tsx listens for and opens
 * DrawingModal. Does NOT import @excalidraw/excalidraw — rendering is just the
 * stored SVG snapshot.
 */
export function DrawingView({ node, getPos, editor }: NodeViewProps) {
  const svg = typeof node.attrs.svg === 'string' ? node.attrs.svg : ''
  const scene = node.attrs.scene as object | null

  const handleClick = () => {
    if (typeof getPos !== 'function') return
    const pos = getPos()
    if (pos === undefined) return
    editor.view.dom.dispatchEvent(
      new CustomEvent('parchment:edit-drawing', {
        bubbles: true,
        detail: { pos, scene },
      }),
    )
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      {svg ? (
        // biome-ignore lint/a11y/useKeyWithClickEvents: drawing block is a mouse-driven atom; keyboard access is provided by the editor's node selection + Enter-to-edit pattern
        // biome-ignore lint/performance/noImgElement: SVG data-URI cannot use next/image (no src optimization applies to inline data URIs); this is the XSS-safe rendering path for owner-authored SVG
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
          alt="Drawing"
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
          Empty drawing — click to edit
        </button>
      )}
    </NodeViewWrapper>
  )
}
