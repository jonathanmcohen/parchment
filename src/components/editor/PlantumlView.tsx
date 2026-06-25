'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { useState } from 'react'
import { plantumlImageUrl } from '@/lib/editor/plantuml'

/**
 * G6b: PlantumlView — renders a PlantUML diagram node inside the editor.
 *
 * When `NEXT_PUBLIC_PLANTUML_SERVER_URL` is set, renders an `<img>` pointing
 * at the configured PlantUML server (the server returns SVG). The browser
 * fetches the image — no fetch() calls are made by this component.
 *
 * When the server URL is unset (default), shows the source in a `<pre>` with
 * a muted note instructing the user to configure the env var.
 *
 * SECURITY: the URL is always built from the configured server base via
 * `plantumlImageUrl()`, which encodes the source with `plantuml-encoder`
 * (pure URL-safe base64). User source is never interpolated raw into any URL.
 */
export function PlantumlView({ node, getPos, editor }: NodeViewProps) {
  const source = typeof node.attrs.source === 'string' ? node.attrs.source : ''
  const [imgError, setImgError] = useState(false)

  const handleClick = () => {
    if (typeof getPos !== 'function') return
    const pos = getPos()
    if (pos === undefined) return
    editor.view.dom.dispatchEvent(
      new CustomEvent('parchment:edit-plantuml', {
        bubbles: true,
        detail: { pos, source },
      }),
    )
  }

  const url = plantumlImageUrl(source)

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
            border: '2px dashed var(--border)',
            borderRadius: '4px',
            background: 'none',
            color: 'var(--muted)',
          }}
        >
          Empty PlantUML diagram — click to edit
        </button>
      ) : url !== null && !imgError ? (
        // biome-ignore lint/a11y/useKeyWithClickEvents: diagram block is a mouse-driven atom; keyboard access via editor node selection
        // biome-ignore lint/performance/noImgElement: external PlantUML server URL cannot use next/image (dynamic src from user-configured endpoint); <img> is the correct render path
        <img
          src={url}
          alt="PlantUML diagram"
          style={{ maxWidth: '100%', cursor: 'pointer', display: 'block' }}
          onClick={handleClick}
          onError={() => setImgError(true)}
        />
      ) : imgError ? (
        // biome-ignore lint/a11y/useKeyWithClickEvents: diagram block is a mouse-driven atom; keyboard access via editor node selection
        // biome-ignore lint/a11y/noStaticElementInteractions: diagram block is a mouse-driven atom; keyboard access via editor node selection
        <div
          onClick={handleClick}
          style={{
            padding: '1rem',
            background: 'color-mix(in srgb, var(--error) 8%, transparent)',
            border: '1px solid var(--error)',
            borderRadius: '4px',
            cursor: 'pointer',
            color: 'var(--error)',
            fontFamily: 'monospace',
            fontSize: '0.85em',
          }}
        >
          Failed to render (check PLANTUML server)
        </div>
      ) : (
        // Disabled (no server URL) — show source + muted note
        // biome-ignore lint/a11y/useKeyWithClickEvents: diagram block is a mouse-driven atom; keyboard access via editor node selection
        // biome-ignore lint/a11y/noStaticElementInteractions: diagram block is a mouse-driven atom; keyboard access via editor node selection
        <div onClick={handleClick} style={{ cursor: 'pointer' }}>
          <pre
            style={{
              padding: '1rem',
              background: 'var(--surface-muted)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--muted)',
              fontFamily: 'monospace',
              fontSize: '0.85em',
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            {source}
          </pre>
          <p
            style={{
              color: 'var(--muted)',
              fontStyle: 'italic',
              fontSize: '0.8em',
              margin: '0.25em 0 0',
            }}
          >
            PlantUML rendering disabled — set NEXT_PUBLIC_PLANTUML_SERVER_URL
          </p>
        </div>
      )}
    </NodeViewWrapper>
  )
}
