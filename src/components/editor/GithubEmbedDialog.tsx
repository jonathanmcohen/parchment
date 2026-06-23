'use client'

import type { Editor } from '@tiptap/core'
import { useEffect, useId, useRef, useState } from 'react'
import { parseGithubRef } from '@/lib/integrations/github'

type Props = {
  editor: Editor
  /** Document position of the githubEmbed node being edited. */
  pos: number
  /** Seed values when editing an existing node. */
  initialUrl: string
  initialTitle: string
  onClose: () => void
}

/**
 * J6: GithubEmbedDialog — paste-a-URL dialog for the githubEmbed node.
 *
 * On submit it calls parseGithubRef(url) — the SAME strict anti-SSRF parser the
 * server route uses — purely to validate + extract { owner, repo, number, kind }
 * to store on the node. It NEVER fetches GitHub here; the NodeView fetches the
 * live status at render time via /api/github/status. Submitting a non-github.com
 * URL is rejected inline (the button stays disabled with an explanatory message)
 * so an invalid ref is never stored.
 */
export function GithubEmbedDialog({ editor, pos, initialUrl, initialTitle, onClose }: Props) {
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
  const ref = trimmed ? parseGithubRef(trimmed) : null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const submit = () => {
    if (!ref) return
    editor.commands.updateGithubEmbed(pos, ref.owner, ref.repo, ref.number, ref.kind, title.trim())
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
            Embed GitHub PR / issue
          </h2>
          <button
            type="button"
            aria-label="Close GitHub embed dialog"
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
            placeholder="https://github.com/owner/repo/pull/123"
            className="parchment-dialog-input"
          />
          <span id={`${urlId}-status`} className="parchment-dialog-label" role="status">
            {!trimmed
              ? 'Paste a GitHub pull-request or issue URL (github.com only).'
              : ref
                ? `Will embed ${ref.owner}/${ref.repo}#${ref.number} (${ref.kind === 'pr' ? 'pull request' : 'issue'}) with live status.`
                : 'Not a valid github.com PR or issue URL.'}
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
            placeholder="Fallback label shown until live status loads"
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
            disabled={!ref}
            onClick={submit}
          >
            Embed
          </button>
        </div>
      </div>
    </div>
  )
}
