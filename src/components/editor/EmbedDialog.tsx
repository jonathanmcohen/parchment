'use client'

import type { Editor } from '@tiptap/core'
import { useEffect, useId, useRef, useState } from 'react'
import { resolveProvider } from '@/lib/editor/embed-providers'

type Props = {
  editor: Editor
  /** Document position of the embed node being edited. */
  pos: number
  /** The kind chosen from the slash menu (drives the heading + placeholder). */
  kind: 'calendar' | 'spreadsheet'
  /** Seed values when editing an existing node. */
  initialUrl: string
  initialTitle: string
  onClose: () => void
}

const PLACEHOLDER: Record<Props['kind'], string> = {
  calendar: 'https://calendar.google.com/calendar/embed?src=…',
  spreadsheet: 'https://docs.google.com/spreadsheets/d/…/edit',
}

/**
 * J2 + J3: EmbedDialog — paste-a-URL dialog for the embed node.
 *
 * On submit it calls resolveProvider(url) (the SAME allowlist the NodeView uses)
 * purely to (a) record the matched provider id on the node and (b) show a live
 * "this will embed as <Provider>" vs. "unsupported provider — will embed as a
 * link" message. It NEVER builds an iframe src here — the NodeView re-resolves at
 * render time. Submitting an unsupported url is allowed (it round-trips and shows
 * a link card); the message just sets expectations.
 */
export function EmbedDialog({ editor, pos, kind, initialUrl, initialTitle, onClose }: Props) {
  const titleId = useId()
  const urlId = useId()
  const titleFieldId = useId()
  const urlRef = useRef<HTMLInputElement>(null)

  const [url, setUrl] = useState(initialUrl)
  const [title, setTitle] = useState(initialTitle)

  useEffect(() => {
    urlRef.current?.focus()
  }, [])

  const trimmed = url.trim()
  const resolved = trimmed ? resolveProvider(trimmed) : null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const submit = () => {
    if (!trimmed) return
    // Record the matched provider id (or '' when unsupported). The NodeView
    // re-resolves from the url at render time — the id is just a caption hint.
    const providerId = resolved?.provider.id ?? ''
    editor.commands.updateEmbed(pos, providerId, trimmed, title.trim())
    onClose()
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss on click is standard modal UX; keyboard close is handled by the inner dialog's onKeyDown
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
            {kind === 'calendar' ? 'Embed calendar' : 'Embed spreadsheet'}
          </h2>
          <button
            type="button"
            aria-label="Close embed dialog"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="parchment-dialog-field">
          <label htmlFor={urlId} className="parchment-dialog-label">
            URL{' '}
            <span aria-hidden="true" className="parchment-dialog-required">
              *
            </span>
          </label>
          <input
            id={urlId}
            ref={urlRef}
            type="url"
            aria-required="true"
            aria-describedby={`${urlId}-status`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={PLACEHOLDER[kind]}
            className="parchment-dialog-input"
          />
          <span id={`${urlId}-status`} className="parchment-dialog-label" role="status">
            {!trimmed
              ? 'Paste a public Google Calendar, Google Sheets, Airtable, or Office URL.'
              : resolved
                ? `Will embed as ${resolved.provider.label} (sandboxed iframe).`
                : 'Unsupported provider — will embed as a click-to-open link.'}
          </span>
        </div>

        <div className="parchment-dialog-field">
          <label htmlFor={titleFieldId} className="parchment-dialog-label">
            Title (optional)
          </label>
          <input
            id={titleFieldId}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Accessible label for the embed"
            className="parchment-dialog-input"
          />
        </div>

        <div className="parchment-dialog-actions">
          <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="parchment-dialog-btn-primary"
            disabled={!trimmed}
            onClick={submit}
          >
            {resolved ? 'Embed' : 'Add link'}
          </button>
        </div>
      </div>
    </div>
  )
}
