'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

type Props = {
  editor: Editor
  /** Document position of the mermaid node being edited. */
  pos: number
  /** The mermaid node's current source, used to seed the textarea. */
  initialSource: string
  onClose: () => void
}

/**
 * MermaidPopover — a modal dialog for editing a mermaid node's source (G6a).
 *
 * Mirrors MathPopover's dialog chrome. Holds a `<textarea>` for the mermaid
 * source and a live SVG preview beneath it (re-rendered on each change).
 * mermaid is lazy-imported here (client-only) with error catch so invalid
 * mermaid shows the error inline rather than crashing. Apply commits via the
 * shared `updateMermaid(pos, source)` command; Cancel discards.
 */
export function MermaidPopover({ editor, pos, initialSource, onClose }: Props) {
  const titleId = useId()
  const textareaId = useId()
  const [source, setSource] = useState(initialSource)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  // A stable render ID for the preview (unique per popover instance).
  const renderIdRef = useRef(`parchment-mermaid-preview-${Math.random().toString(36).slice(2)}`)

  // Focus the textarea on open.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Live preview: re-render mermaid into previewRef whenever `source` changes.
  // mermaid is lazy-imported so this component never pulls it at module load.
  useEffect(() => {
    const target = previewRef.current
    if (!target) return
    let cancelled = false

    if (!source.trim()) {
      target.innerHTML = ''
      const placeholder = document.createElement('span')
      placeholder.style.color = '#999'
      placeholder.textContent = '(empty diagram)'
      target.appendChild(placeholder)
      return
    }

    target.innerHTML = ''
    const loadingEl = document.createElement('span')
    loadingEl.style.color = '#999'
    loadingEl.textContent = 'Rendering…'
    target.appendChild(loadingEl)

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
        const { svg } = await mermaid.render(renderIdRef.current, source)
        if (cancelled || !previewRef.current) return
        previewRef.current.innerHTML = ''
        const img = document.createElement('img')
        img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
        img.alt = 'Mermaid diagram preview'
        img.style.maxWidth = '100%'
        previewRef.current.appendChild(img)
      } catch (err) {
        if (cancelled || !previewRef.current) return
        previewRef.current.innerHTML = ''
        const errEl = document.createElement('pre')
        errEl.style.color = '#c00'
        errEl.style.fontSize = '0.8em'
        errEl.style.whiteSpace = 'pre-wrap'
        errEl.textContent = err instanceof Error ? err.message : String(err)
        previewRef.current.appendChild(errEl)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [source])

  const apply = useCallback(() => {
    editor.commands.updateMermaid(pos, source)
    onClose()
  }, [editor, pos, source, onClose])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
    // Cmd/Ctrl+Enter applies (Enter alone inserts a newline in the textarea).
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      apply()
    }
  }

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
        onKeyDown={handleKeyDown}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Edit diagram
          </h2>
          <button
            type="button"
            aria-label="Close diagram editor"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="parchment-dialog-form">
          <div className="parchment-dialog-field">
            <label htmlFor={textareaId} className="parchment-dialog-label">
              Mermaid source
            </label>
            <textarea
              id={textareaId}
              ref={textareaRef}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={'e.g. graph TD;\n  A-->B;'}
              className="parchment-dialog-input parchment-mermaid-textarea"
              rows={6}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className="parchment-dialog-field">
            <span className="parchment-dialog-label">Preview</span>
            {/* Decorative mermaid rendering of the source in the textarea above —
                the textarea is the editable source, so the preview is hidden
                from assistive tech to avoid announcing rendered markup noise. */}
            <div ref={previewRef} className="parchment-mermaid-preview" aria-hidden="true" />
          </div>

          <div className="parchment-dialog-actions">
            <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="parchment-dialog-btn-primary" onClick={apply}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
