'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { pickActiveShare, type ShareLinkRow } from '@/lib/docs/share-link'

// G1/F9 share-management dialog (owner side, in the editor). The link model: a
// share row's existence == "Anyone with the link" ON; revoking deletes the row,
// so NO active row == "Restricted". The public viewer URL is /share/<token>.
//
// F9 link-side UX (real, no new backend):
//   • On open, auto-create a share when none is active so a ready-to-copy link is
//     shown immediately; the primary button is "Copy link" (copies the real `url`
//     from the API). A re-open reuses the existing active share — never dupes.
//   • A Restricted ⇄ "Anyone with the link" toggle bound to the active-link state:
//     Restricted revokes every share row (public route 404s); Anyone (re)creates a
//     link with the chosen role. This is REAL enforcement on the existing
//     POST/DELETE lifecycle — no schema change.
//   • Permission stores view/comment/edit/suggest but v0.1 renders read-only on the
//     public route (write perms are a v0.2 GAP, noted to the viewer).
//
// Per-email sharing stays a disabled v0.2 placeholder (a per-email grants table +
// route is genuinely new feature logic — out of scope for F9).

type Props = {
  docId: string
  onClose: () => void
}

const PERMISSION_OPTIONS: { value: string; label: string }[] = [
  { value: 'view', label: 'Can view' },
  { value: 'comment', label: 'Can comment' },
  { value: 'edit', label: 'Can edit' },
  { value: 'suggest', label: 'Can suggest' },
]

export function ShareDialog({ docId, onClose }: Props) {
  const titleId = useId()
  const accessId = useId()
  const permId = useId()
  const passwordId = useId()
  const expiryId = useId()
  const emailId = useId()

  const [shares, setShares] = useState<ShareLinkRow[]>([])
  const [permission, setPermission] = useState('view')
  const [password, setPassword] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Guards the open-time auto-create so it runs at most once per mount even under
  // React 18 StrictMode's double-invoke.
  const autoCreatedRef = useRef(false)

  // The active share backs the live "Anyone with the link" state. null ==
  // Restricted (no active link). Newest non-expired wins — never a duplicate.
  const activeShare = pickActiveShare(shares)
  const isPublic = activeShare !== null

  const reload = useCallback(async (): Promise<ShareLinkRow[]> => {
    try {
      const res = await fetch(`/api/docs/${docId}/shares`)
      if (!res.ok) return []
      const rows = (await res.json()) as ShareLinkRow[]
      setShares(rows)
      return rows
    } catch {
      // best-effort list refresh
      return []
    }
  }, [docId])

  // Create a share with the current role/password/expiry. Returns the new row's
  // url (origin-correct, straight from the API) or null on failure.
  const createShare = useCallback(async (): Promise<string | null> => {
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
        return null
      }
      const created = (await res.json()) as { id: string; token: string; url: string }
      await reload()
      return created.url
    } catch {
      setError('Could not create the link.')
      return null
    }
  }, [docId, expiresAt, password, permission, reload])

  // Revoke every share row for this doc → Restricted (no active link).
  const revokeAll = useCallback(
    async (rows: readonly ShareLinkRow[]) => {
      await Promise.all(
        rows.map((row) =>
          fetch(`/api/shares/${row.id}`, { method: 'DELETE' }).catch(() => undefined),
        ),
      )
      await reload()
    },
    [reload],
  )

  // F9: on open, ensure a ready-to-copy link exists. Reuse the existing active
  // share when present (re-open never duplicates); otherwise create one once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only auto-create; the autoCreatedRef guard keeps it once-per-open and createShare/reload identities are stable.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const rows = await reload()
      if (cancelled || autoCreatedRef.current) return
      autoCreatedRef.current = true
      if (pickActiveShare(rows) === null) await createShare()
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Copy the active link's origin-correct url (straight from the API response),
  // not a guessed string. Shows a transient "Link copied" toast.
  const copyLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard may be unavailable (insecure context) — no-op
    }
  }, [])

  // Primary action: copy the active link. If somehow none is active (e.g. the
  // auto-create raced or failed), create one first, then copy its real url.
  const handleCopyLink = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      if (activeShare) {
        await copyLink(activeShare.url)
      } else {
        const url = await createShare()
        if (url) await copyLink(url)
      }
    } finally {
      setBusy(false)
    }
  }, [activeShare, busy, copyLink, createShare])

  // Toggle Restricted ⇄ Anyone with the link.
  const setRestricted = useCallback(
    async (restricted: boolean) => {
      if (busy) return
      if (restricted === !isPublic) return // already in this state
      setBusy(true)
      try {
        if (restricted) {
          await revokeAll(shares)
        } else {
          await createShare()
        }
      } finally {
        setBusy(false)
      }
    },
    [busy, createShare, isPublic, revokeAll, shares],
  )

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

  const handleCopyRow = useCallback(
    async (url: string) => {
      await copyLink(url)
    },
    [copyLink],
  )

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

        {/* ── Restricted ⇄ Anyone with the link ─────────────────────────── */}
        <fieldset className="parchment-dialog-field parchment-share-fieldset">
          <legend id={accessId} className="parchment-dialog-label">
            General access
          </legend>
          <div className="parchment-share-toggle">
            <button
              type="button"
              className="parchment-share-toggle-btn"
              aria-pressed={!isPublic}
              disabled={busy}
              onClick={() => void setRestricted(true)}
            >
              Restricted
            </button>
            <button
              type="button"
              className="parchment-share-toggle-btn"
              aria-pressed={isPublic}
              disabled={busy}
              onClick={() => void setRestricted(false)}
            >
              Anyone with the link
            </button>
          </div>
          <p className="parchment-share-toggle-hint">
            {isPublic
              ? 'Anyone with the link can access this document.'
              : 'Only people you share with directly can access this document.'}
          </p>
        </fieldset>

        {/* Role picker — applies to the "Anyone with the link" grant. */}
        <div className="parchment-dialog-field">
          <label htmlFor={permId} className="parchment-dialog-label">
            Link role
          </label>
          <select
            id={permId}
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
            className="parchment-dialog-select"
            disabled={!isPublic || busy}
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
            disabled={busy}
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
            disabled={busy}
          />
        </div>

        {/* Per-email sharing — disabled v0.2 placeholder (needs a new grants
            table + route; out of scope for F9). No dead Add button. */}
        <div className="parchment-dialog-field">
          <label htmlFor={emailId} className="parchment-dialog-label">
            Add people, groups, calendar events (v0.2)
          </label>
          <input
            id={emailId}
            type="email"
            placeholder="Invite by email — coming in v0.2"
            disabled
            aria-disabled="true"
            className="parchment-dialog-input"
          />
        </div>

        {error && (
          <p className="parchment-share-error" role="alert">
            {error}
          </p>
        )}

        <div className="parchment-dialog-actions">
          {copied && (
            <span className="parchment-share-toast" role="status">
              Link copied
            </span>
          )}
          <button
            type="button"
            className="parchment-dialog-btn-primary"
            onClick={() => void handleCopyLink()}
            disabled={busy || !isPublic}
          >
            {copied ? 'Copied' : 'Copy link'}
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
                    onClick={() => void handleCopyRow(row.url)}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="parchment-dialog-btn-secondary"
                    onClick={() => void handleRevoke(row.id)}
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
