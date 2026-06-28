'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { DocPermissionsPanel } from '@/components/share/DocPermissionsPanel'
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
//   • Role / password / expiry are LIVE controls while a link is active: changing
//     any of them re-applies to the live link by revoking it and creating a fresh
//     one with the chosen settings (there is no PATCH endpoint — the G1 lifecycle
//     is create/revoke, so "edit a link" == revoke-and-recreate). Exactly one
//     active link is kept (no dupes); the new `url` is origin-correct from the API.
//     This makes the brief's "Anyone (re)creates a link with the chosen role" the
//     real behaviour and leaves no dead control.
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

// The link settings a create/re-apply applies. Passed explicitly (not read from
// state) so a change handler can re-apply the just-chosen value without waiting
// for a state flush.
type LinkSettings = { permission: string; password: string; expiresAt: string }

export function ShareDialog({ docId, onClose }: Props) {
  const titleId = useId()
  const accessId = useId()
  const permId = useId()
  const passwordId = useId()
  const expiryId = useId()

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
  // The password value the live link currently carries (cleartext can't be read
  // back from the API, so we track what we last sent). Lets the password field
  // re-apply on blur ONLY when it actually changed — no needless token rotation.
  const appliedPasswordRef = useRef('')

  // The active share backs the live "Anyone with the link" state. null ==
  // Restricted (no active link). Newest non-expired wins — never a duplicate.
  const activeShare = pickActiveShare(shares)
  const isPublic = activeShare !== null
  // Tracks the share whose settings we last mirrored into the controls, so the
  // role/expiry pickers always reflect the LIVE link (e.g. re-opening an existing
  // 'edit' link shows "Can edit") without clobbering a value mid-edit on re-render.
  const syncedShareIdRef = useRef<string | null>(null)

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

  // Create a share with the given settings (defaulting to the current control
  // values). Returns the new row's url (origin-correct, straight from the API) or
  // null on failure. Settings are passed explicitly so a change handler can apply
  // the just-chosen value without waiting for a React state flush.
  const createShare = useCallback(
    async (settings?: LinkSettings): Promise<string | null> => {
      const s: LinkSettings = settings ?? { permission, password, expiresAt }
      setError(null)
      try {
        const body: { permission: string; password?: string; expiresAt?: string } = {
          permission: s.permission,
        }
        if (s.password.length > 0) body.password = s.password
        // <input type="date"> gives YYYY-MM-DD; expand to end-of-day ISO so "today"
        // isn't already-expired and the API's future-date check passes.
        if (s.expiresAt.length > 0)
          body.expiresAt = new Date(`${s.expiresAt}T23:59:59`).toISOString()

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
        // Remember the cleartext we just applied (the API never returns it) so a
        // later role/expiry change can preserve the password without re-typing.
        appliedPasswordRef.current = s.password
        await reload()
        return created.url
      } catch {
        setError('Could not create the link.')
        return null
      }
    },
    [docId, expiresAt, password, permission, reload],
  )

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

  // Re-apply link settings to the live "Anyone with the link" link. The G1
  // lifecycle has no PATCH — editing a link == revoke the active row(s) and
  // create a fresh one with the chosen settings (keeps exactly one active link,
  // origin-correct url). No-op (just local state) when no link is active. The new
  // settings are passed explicitly so the just-chosen value is applied even before
  // its setState has flushed.
  const reapplyLink = useCallback(
    async (settings: LinkSettings) => {
      if (busy) return
      if (pickActiveShare(shares) === null) return // Restricted: nothing live to update
      setBusy(true)
      try {
        const rows = await reload()
        await revokeAll(rows)
        await createShare(settings)
      } finally {
        setBusy(false)
      }
    },
    [busy, createShare, reload, revokeAll, shares],
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

  // Mirror the LIVE link's role/expiry into the controls so the pickers are
  // truthful (a re-opened 'edit' link shows "Can edit", etc.). Keyed on the active
  // share id so it runs once per distinct active link — it never overwrites the
  // user's in-progress choice on an unrelated re-render. Password is write-only
  // (the API returns only `hasPassword`, never the cleartext), so it isn't mirrored.
  useEffect(() => {
    if (activeShare === null) {
      syncedShareIdRef.current = null
      return
    }
    if (syncedShareIdRef.current === activeShare.id) return
    syncedShareIdRef.current = activeShare.id
    setPermission(activeShare.permission)
    // expiresAt comes back as an ISO string; the date input wants YYYY-MM-DD.
    setExpiresAt(activeShare.expiresAt ? activeShare.expiresAt.slice(0, 10) : '')
  }, [activeShare])

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

  // LT7-1: select the whole URL on click via the Selection API (NOT the
  // deprecated execCommand) so the user can copy it with the keyboard. Operates
  // on the clicked <code> element directly — no document.execCommand('selectAll').
  const handleSelectUrl = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(e.currentTarget)
    selection.removeAllRanges()
    selection.addRange(range)
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
              ? permission === 'view'
                ? 'Published to the web — anyone with the link sees a read-only page (comments shown read-only).'
                : 'Anyone with the link can access this document.'
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
            onChange={(e) => {
              const next = e.target.value
              setPermission(next)
              // Live link: re-apply the chosen role immediately (revoke+recreate),
              // preserving the in-session password and current expiry.
              void reapplyLink({
                permission: next,
                password: password.length > 0 ? password : appliedPasswordRef.current,
                expiresAt,
              })
            }}
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
            placeholder={activeShare?.hasPassword ? 'Password set — type to change' : 'No password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            // Apply on blur (not per keystroke) when a live link exists and the
            // value actually changed — avoids rotating the token on every key.
            onBlur={() => {
              if (!isPublic) return
              if (password === appliedPasswordRef.current) return
              void reapplyLink({ permission, password, expiresAt })
            }}
            className="parchment-dialog-input"
            disabled={!isPublic || busy}
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
            onChange={(e) => {
              const next = e.target.value
              setExpiresAt(next)
              // Live link: re-apply the chosen expiry immediately (revoke+recreate),
              // preserving role and the in-session password.
              if (isPublic)
                void reapplyLink({
                  permission,
                  password: password.length > 0 ? password : appliedPasswordRef.current,
                  expiresAt: next,
                })
            }}
            className="parchment-dialog-input"
            disabled={!isPublic || busy}
          />
        </div>

        {/* A4: per-user document ACL — the real people-based sharing (replaces the
            former disabled v0.2 placeholder). All operations are MANAGE-gated on
            the server (owner/admin); a non-manager simply sees an error. */}
        <DocPermissionsPanel docId={docId} />

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
                  {/* LT7-1: click selects the whole URL (Selection API) so it can
                      be copied with the keyboard. LT7-2: the per-row Copy button
                      is gone — the single primary "Copy link" above is the one
                      Copy affordance; this row keeps status + Revoke only. */}
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: select-all is a pointer convenience; the URL text is also keyboard-selectable natively and the primary "Copy link" button is the keyboard-accessible copy path */}
                  <code
                    className="parchment-share-list-url cursor-pointer"
                    onClick={handleSelectUrl}
                    title="Click to select the full link"
                  >
                    {row.url}
                  </code>
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
