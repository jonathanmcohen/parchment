'use client'

// G17: Custom CSS dialog — a textarea + Apply/Cancel + hint.
// On Apply: updates local state via onApply then PUTs to the API to persist.

import { useId, useState } from 'react'

type Props = {
  /** Current custom CSS — seeds the textarea. */
  initial?: string
  /** docId is needed to persist via the API. */
  docId: string
  onApply: (css: string) => void
  onClose: () => void
}

export function CustomCssDialog({ initial = '', docId, onApply, onClose }: Props) {
  const titleId = useId()
  const textareaId = useId()
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)

  const handleApply = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/docs/${docId}/custom-css`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ css: value }),
      })
      if (!res.ok) {
        setSaving(false)
        return
      }
    } catch {
      setSaving(false)
      return
    }
    setSaving(false)
    onApply(value)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss on click is standard modal UX
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
        className="parchment-dialog parchment-custom-css-dialog"
        onKeyDown={handleKeyDown}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Custom CSS
          </h2>
          <button
            type="button"
            aria-label="Close custom CSS dialog"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <p className="parchment-dialog-hint">
          Scoped to this document — cannot affect the app chrome or other documents.
        </p>

        <div className="parchment-dialog-field">
          <label htmlFor={textareaId} className="parchment-dialog-label">
            CSS
          </label>
          <textarea
            id={textareaId}
            className="parchment-dialog-input parchment-custom-css-textarea"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`/* Style this document's content */\nh1 { color: navy; }\np { line-height: 1.8; }`}
            rows={12}
            spellCheck={false}
          />
        </div>

        <div className="parchment-dialog-actions">
          <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="parchment-dialog-btn-primary"
            onClick={() => void handleApply()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
