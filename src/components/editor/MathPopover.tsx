'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

type Props = {
  editor: Editor
  /** Document position of the math node being edited. */
  pos: number
  /** The math node's current LaTeX, used to seed the textarea. */
  initialLatex: string
  onClose: () => void
}

/**
 * MathPopover — a small modal dialog for editing a math node's LaTeX (G4).
 *
 * Mirrors LinkPopover's dialog chrome. Holds a `<textarea>` for the LaTeX source
 * and a live KaTeX preview beneath it (re-rendered on every keystroke). KaTeX is
 * lazy-imported here (client-only) with `throwOnError:false` so invalid LaTeX
 * shows the error inline rather than crashing. Apply commits via the shared
 * `updateMath(pos, latex)` command; Cancel discards.
 *
 * Note: useCallback is imported from 'react' below (not 'use client' specific).
 */
export function MathPopover({ editor, pos, initialLatex, onClose }: Props) {
  const titleId = useId()
  const textareaId = useId()
  const [latex, setLatex] = useState(initialLatex)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  // Focus the textarea on open.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Live preview: re-render KaTeX into previewRef whenever `latex` changes.
  // katex + its CSS are lazy-imported so this component never pulls them at
  // module load (matches the math node-definition boundary).
  useEffect(() => {
    const target = previewRef.current
    if (!target) return
    let cancelled = false
    void import('katex/dist/katex.min.css')
    if (latex.trim() === '') {
      target.textContent = '(empty)'
      return
    }
    void import('katex').then(({ default: katex }) => {
      if (cancelled || !previewRef.current) return
      try {
        katex.render(latex, previewRef.current, { displayMode: true, throwOnError: false })
      } catch {
        if (previewRef.current) previewRef.current.textContent = latex
      }
    })
    return () => {
      cancelled = true
    }
  }, [latex])

  const apply = useCallback(() => {
    editor.commands.updateMath(pos, latex)
    onClose()
  }, [editor, pos, latex, onClose])

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
            Edit equation
          </h2>
          <button
            type="button"
            aria-label="Close equation editor"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="parchment-dialog-form">
          <div className="parchment-dialog-field">
            <label htmlFor={textareaId} className="parchment-dialog-label">
              LaTeX
            </label>
            <textarea
              id={textareaId}
              ref={textareaRef}
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              placeholder="e.g. \frac{a}{b} = c"
              className="parchment-dialog-input parchment-math-textarea"
              rows={4}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className="parchment-dialog-field">
            <span className="parchment-dialog-label">Preview</span>
            {/* Decorative KaTeX rendering of the LaTeX in the textarea above —
                the textarea is the editable source, so the preview is hidden
                from assistive tech to avoid announcing rendered markup noise. */}
            <div ref={previewRef} className="parchment-math-preview" aria-hidden="true" />
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
