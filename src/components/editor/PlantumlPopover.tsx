'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { plantumlImageUrl } from '@/lib/editor/plantuml'

type Props = {
  editor: Editor
  /** Document position of the plantuml node being edited. */
  pos: number
  /** The plantuml node's current source, used to seed the textarea. */
  initialSource: string
  onClose: () => void
}

/**
 * PlantumlPopover — a modal dialog for editing a plantuml node's source (G6b).
 *
 * Mirrors MermaidPopover's dialog chrome. Holds a `<textarea>` for the PlantUML
 * source and a live preview beneath it (re-rendered on each change).
 *
 * When `NEXT_PUBLIC_PLANTUML_SERVER_URL` is set, the preview is an `<img>`
 * pointing at the server. Otherwise it shows the source in a `<pre>` with a
 * muted disabled note — no external calls are made.
 *
 * Apply commits via `updatePlantuml(pos, source)`; Cancel discards.
 */
export function PlantumlPopover({ editor, pos, initialSource, onClose }: Props) {
  const titleId = useId()
  const textareaId = useId()
  const [source, setSource] = useState(initialSource)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus the textarea on open.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const apply = useCallback(() => {
    editor.commands.updatePlantuml(pos, source)
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

  // Build the preview URL from the current source.
  const previewUrl = plantumlImageUrl(source)

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
            Edit PlantUML diagram
          </h2>
          <button
            type="button"
            aria-label="Close PlantUML diagram editor"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="parchment-dialog-form">
          <div className="parchment-dialog-field">
            <label htmlFor={textareaId} className="parchment-dialog-label">
              PlantUML source
            </label>
            <textarea
              id={textareaId}
              ref={textareaRef}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={'e.g. @startuml\nA -> B : hello\n@enduml'}
              className="parchment-dialog-input parchment-plantuml-textarea"
              rows={6}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className="parchment-dialog-field">
            <span className="parchment-dialog-label">Preview</span>
            {/* Decorative preview — hidden from assistive tech to avoid
                announcing rendered markup noise. */}
            <div className="parchment-plantuml-preview" aria-hidden="true">
              {!source.trim() ? (
                <span style={{ color: 'var(--page-ink-muted)' }}>(empty diagram)</span>
              ) : previewUrl !== null ? (
                // biome-ignore lint/performance/noImgElement: external PlantUML server URL cannot use next/image (dynamic src from user-configured endpoint)
                <img src={previewUrl} alt="PlantUML diagram preview" style={{ maxWidth: '100%' }} />
              ) : (
                // Disabled — show source + muted note
                <>
                  <pre
                    style={{
                      padding: '0.75rem',
                      background: 'var(--page-surface-muted)',
                      border: '1px solid var(--page-border)',
                      borderRadius: '4px',
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
                      color: 'var(--page-ink-muted)',
                      fontStyle: 'italic',
                      fontSize: '0.8em',
                      margin: '0.25em 0 0',
                    }}
                  >
                    Configure PLANTUML_SERVER_URL to render
                  </p>
                </>
              )}
            </div>
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
