'use client'

import { useCallback, useEffect, useId, useState } from 'react'

// G1 share-management dialog (owner side, in the editor). Lists the doc's
// existing share links and creates new ones via the owner-scoped API. The public
// viewer URL is /share/<token>. Permission stores view/comment/edit/suggest but
// v0.1 renders read-only on the public route (write perms are a v0.2 GAP, noted
// to the viewer). Per-email sharing is a disabled stub (single-owner now).

type Props = {
  docId: string
  onClose: () => void
}

type ShareRow = {
  id: string
  token: string
  permission: string
  hasPassword: boolean
  expiresAt: string | null
  createdAt: string
  url: string
}

const PERMISSION_OPTIONS: { value: string; label: string }[] = [
  { value: 'view', label: 'Can view' },
  { value: 'comment', label: 'Can comment' },
  { value: 'edit', label: 'Can edit' },
  { value: 'suggest', label: 'Can suggest' },
]

export function ShareDialog({ docId, onClose }: Props) {
  const titleId = useId()
  const permId = useId()
  const passwordId = useId()
  const expiryId = useId()
  const emailId = useId()

  const [shares, setShares] = useState<ShareRow[]>([])
  const [permission, setPermission] = useState('view')
  const [password, setPassword] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/docs/${docId}/shares`)
      if (!res.ok) return
      setShares((await res.json()) as ShareRow[])
    } catch {
      // best-effort list refresh
    }
  }, [docId])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleCreate = useCallback(async () => {
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const body: { permission: string; password?: string; expiresAt?: string } = { permission }
      if (password.length > 0) body.password = password
      // <input type="date"> gives YYYY-MM-DD; expand to end-of-day ISO so "today"
      // isn't already-expired and the API's future-date check passes.
      if (expiresAt.length > 0) body.expiresAt = new Date(`${expiresAt}T23:59:59`).toISOString()

      const res = await fetch(`/api/docs/${docId}/shares`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(
          data.error === 'invalid_expiry'
            ? 'Pick a future expiry date.'
            : 'Could not create the link.',
        )
        return
      }
      setPassword('')
      setExpiresAt('')
      await reload()
    } catch {
      setError('Could not create the link.')
    } finally {
      setCreating(false)
    }
  }, [creating, docId, expiresAt, password, permission, reload])

  const handleRevoke = useCallback(
    async (shareId: string) => {
      try {
        await fetch(`/api/shares/${shareId}`, { method: 'DELETE' })
        await reload()
      } catch {
        // best-effort
      }
    },
    [reload],
  )

  const handleCopy = useCallback(async (row: ShareRow) => {
    try {
      await navigator.clipboard.writeText(row.url)
      setCopiedToken(row.token)
      setTimeout(() => setCopiedToken(null), 1500)
    } catch {
      // clipboard may be unavailable (insecure context) — no-op
    }
  }, [])

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
        className="parchment-dialog"
        onKeyDown={handleKeyDown}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Share document
          </h2>
          <button
            type="button"
            aria-label="Close share dialog"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* ── Create a link ─────────────────────────────────────────────── */}
        <div className="parchment-dialog-field">
          <label htmlFor={permId} className="parchment-dialog-label">
            Anyone with the link
          </label>
          <select
            id={permId}
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
            className="parchment-dialog-select"
          >
            {PERMISSION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="parchment-dialog-field">
          <label htmlFor={passwordId} className="parchment-dialog-label">
            Password (optional)
          </label>
          <input
            id={passwordId}
            type="password"
            autoComplete="new-password"
            placeholder="No password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="parchment-dialog-input"
          />
        </div>

        <div className="parchment-dialog-field">
          <label htmlFor={expiryId} className="parchment-dialog-label">
            Expires (optional)
          </label>
          <input
            id={expiryId}
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="parchment-dialog-input"
          />
        </div>

        {/* Per-email sharing — disabled stub (single-owner v0.1). */}
        <div className="parchment-dialog-field">
          <label htmlFor={emailId} className="parchment-dialog-label">
            Invite by email (v0.2)
          </label>
          <input
            id={emailId}
            type="email"
            placeholder="Coming in v0.2"
            disabled
            className="parchment-dialog-input"
          />
        </div>

        {error && (
          <p className="parchment-share-error" role="alert">
            {error}
          </p>
        )}

        <div className="parchment-dialog-actions">
          <button
            type="button"
            className="parchment-dialog-btn-primary"
            onClick={handleCreate}
            disabled={creating}
          >
            Create link
          </button>
        </div>

        {/* ── Existing links ────────────────────────────────────────────── */}
        {shares.length > 0 && (
          <ul className="parchment-share-list">
            {shares.map((row) => (
              <li key={row.id} className="parchment-share-list-item">
                <div className="parchment-share-list-meta">
                  <code className="parchment-share-list-url">{row.url}</code>
                  <span className="parchment-share-list-tags">
                    {row.permission}
                    {row.hasPassword ? ' · password' : ''}
                    {row.expiresAt
                      ? ` · expires ${new Date(row.expiresAt).toLocaleDateString()}`
                      : ''}
                  </span>
                </div>
                <div className="parchment-share-list-actions">
                  <button
                    type="button"
                    className="parchment-dialog-btn-secondary"
                    onClick={() => handleCopy(row)}
                  >
                    {copiedToken === row.token ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    className="parchment-dialog-btn-secondary"
                    onClick={() => handleRevoke(row.id)}
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
