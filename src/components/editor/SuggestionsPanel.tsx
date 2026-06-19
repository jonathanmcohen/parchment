'use client'

import type { Editor } from '@tiptap/core'
import { useEffect, useState } from 'react'
import type { TrackedChange } from '@/lib/editor/track-changes'
import { authorColor, collectChanges } from '@/lib/editor/track-changes'

// ── SuggestionsPanel ───────────────────────────────────────────────────────

interface Props {
  editor: Editor
}

export function SuggestionsPanel({ editor }: Props) {
  const [changes, setChanges] = useState<TrackedChange[]>([])

  // Re-collect changes on every editor update
  useEffect(() => {
    const refresh = () => {
      setChanges(collectChanges(editor.getJSON()))
    }
    refresh()
    editor.on('update', refresh)
    return () => {
      editor.off('update', refresh)
    }
  }, [editor])

  const handleAcceptAll = () => {
    editor.chain().focus().acceptAllChanges().run()
  }

  const handleRejectAll = () => {
    editor.chain().focus().rejectAllChanges().run()
  }

  const handleAccept = (c: TrackedChange) => {
    editor.chain().focus().acceptChange(c.from, c.to, c.type).run()
  }

  const handleReject = (c: TrackedChange) => {
    editor.chain().focus().rejectChange(c.from, c.to, c.type).run()
  }

  return (
    <aside aria-label="Suggestions" className="parchment-suggestions-panel">
      {/* Header */}
      <div className="parchment-suggestions-header">
        <span className="parchment-suggestions-title">Suggestions</span>
        <div className="parchment-suggestions-header-actions">
          <button
            type="button"
            aria-label="Accept all changes"
            className="parchment-suggestions-action-btn parchment-suggestions-accept-btn"
            disabled={changes.length === 0}
            onClick={handleAcceptAll}
          >
            Accept all
          </button>
          <button
            type="button"
            aria-label="Reject all changes"
            className="parchment-suggestions-action-btn parchment-suggestions-reject-btn"
            disabled={changes.length === 0}
            onClick={handleRejectAll}
          >
            Reject all
          </button>
        </div>
      </div>

      {/* Change list */}
      <ul className="parchment-suggestions-list">
        {changes.length === 0 ? (
          <li className="parchment-suggestions-empty">No suggestions yet.</li>
        ) : (
          changes.map((c) => (
            <ChangeRow
              key={c.id}
              change={c}
              onAccept={() => handleAccept(c)}
              onReject={() => handleReject(c)}
            />
          ))
        )}
      </ul>
    </aside>
  )
}

// ── ChangeRow ──────────────────────────────────────────────────────────────

interface ChangeRowProps {
  change: TrackedChange
  onAccept: () => void
  onReject: () => void
}

function ChangeRow({ change, onAccept, onReject }: ChangeRowProps) {
  const color = authorColor(change.author)
  const label = change.type === 'insertion' ? 'Insertion' : 'Deletion'

  return (
    <li className="parchment-suggestions-row">
      <div className="parchment-suggestions-row-meta">
        {/* Type badge */}
        <span className={`parchment-suggestions-badge parchment-suggestions-badge--${change.type}`}>
          {label}
        </span>
        {/* Author dot + name */}
        <span
          className="parchment-suggestions-author-dot"
          aria-hidden="true"
          style={{ background: color }}
        />
        <span className="parchment-suggestions-author" style={{ color }}>
          {change.author}
        </span>
      </div>
      {/* Changed text preview */}
      <p className="parchment-suggestions-text">
        {change.text.length > 120 ? `${change.text.slice(0, 120)}…` : change.text}
      </p>
      {/* Accept / Reject buttons */}
      <div className="parchment-suggestions-row-actions">
        <button
          type="button"
          aria-label={`Accept ${label.toLowerCase()} by ${change.author}`}
          className="parchment-suggestions-action-btn parchment-suggestions-accept-btn"
          onClick={onAccept}
        >
          Accept
        </button>
        <button
          type="button"
          aria-label={`Reject ${label.toLowerCase()} by ${change.author}`}
          className="parchment-suggestions-action-btn parchment-suggestions-reject-btn"
          onClick={onReject}
        >
          Reject
        </button>
      </div>
    </li>
  )
}
