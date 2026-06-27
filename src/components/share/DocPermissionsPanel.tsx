'use client'

import { useCallback, useEffect, useId, useState } from 'react'

// A4: per-user document ACL panel. Mounted inside the Share dialog next to the
// public/password-link controls. On mount it loads the current grants
// (GET /api/docs/[id]/permissions) and the pickable people directory
// (GET /api/users/pickable). All four operations hit the MANAGE-gated REST from
// Task 7 — the server is the enforcement point; a non-manage user simply gets 404s
// and the panel surfaces an error. UI hiding is never the security boundary.

type DocPermRole = 'viewer' | 'commenter' | 'editor'

type Grant = { userId: string; name: string; email: string; role: DocPermRole }
type Pickable = { id: string; name: string; email: string }

const DOC_PERM_ROLES: { value: DocPermRole; label: string }[] = [
  { value: 'viewer', label: 'Can view' },
  { value: 'commenter', label: 'Can comment' },
  { value: 'editor', label: 'Can edit' },
]

export function DocPermissionsPanel({ docId }: { docId: string }) {
  const addUserId = useId()
  const addRoleId = useId()

  const [grants, setGrants] = useState<Grant[]>([])
  const [people, setPeople] = useState<Pickable[]>([])
  const [pickUserId, setPickUserId] = useState('')
  const [pickRole, setPickRole] = useState<DocPermRole>('viewer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadGrants = useCallback(async () => {
    try {
      const res = await fetch(`/api/docs/${docId}/permissions`)
      if (!res.ok) {
        // 404 = the caller cannot manage this doc; show a gentle, non-leaky note.
        setError(res.status === 404 ? 'You cannot manage sharing for this document.' : null)
        return
      }
      const body = (await res.json()) as { permissions: Grant[] }
      setGrants(body.permissions)
      setError(null)
    } catch {
      // best-effort
    }
  }, [docId])

  const loadPeople = useCallback(async () => {
    try {
      const res = await fetch('/api/users/pickable')
      if (!res.ok) return
      const body = (await res.json()) as { users: Pickable[] }
      setPeople(body.users)
    } catch {
      // best-effort
    }
  }, [])

  useEffect(() => {
    void loadGrants()
    void loadPeople()
  }, [loadGrants, loadPeople])

  const grant = useCallback(
    async (userId: string, role: DocPermRole) => {
      if (!userId || busy) return
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`/api/docs/${docId}/permissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId, role }),
        })
        if (!res.ok) {
          setError(
            res.status === 404
              ? 'You cannot manage sharing for this document.'
              : 'Could not share.',
          )
          return
        }
        await loadGrants()
      } finally {
        setBusy(false)
      }
    },
    [busy, docId, loadGrants],
  )

  const revoke = useCallback(
    async (userId: string) => {
      if (busy) return
      setBusy(true)
      try {
        const res = await fetch(`/api/docs/${docId}/permissions`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId }),
        })
        if (res.ok) await loadGrants()
      } finally {
        setBusy(false)
      }
    },
    [busy, docId, loadGrants],
  )

  // people not already granted (and not the picker's empty value)
  const grantedIds = new Set(grants.map((g) => g.userId))
  const available = people.filter((p) => !grantedIds.has(p.id))

  return (
    <div data-testid="doc-permissions-panel" className="parchment-dialog-field">
      <span className="parchment-dialog-label">People with access</span>

      {grants.length > 0 ? (
        <ul className="parchment-share-list">
          {grants.map((g) => (
            <li
              key={g.userId}
              className="parchment-share-list-item"
              data-testid="doc-permission-row"
            >
              <div className="parchment-share-list-meta">
                <span className="parchment-share-list-url">{g.name || g.email}</span>
                <span className="parchment-share-list-tags">{g.email}</span>
              </div>
              <div className="parchment-share-list-actions">
                <select
                  aria-label={`Role for ${g.email}`}
                  value={g.role}
                  disabled={busy}
                  onChange={(e) => void grant(g.userId, e.target.value as DocPermRole)}
                  className="parchment-dialog-select"
                >
                  {DOC_PERM_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="parchment-dialog-btn-secondary"
                  disabled={busy}
                  onClick={() => void revoke(g.userId)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="parchment-share-toggle-hint">No people added yet.</p>
      )}

      {/* Add-people row */}
      <div className="parchment-share-add-row">
        <label htmlFor={addUserId} className="sr-only">
          Person
        </label>
        <select
          id={addUserId}
          value={pickUserId}
          disabled={busy || available.length === 0}
          onChange={(e) => setPickUserId(e.target.value)}
          className="parchment-dialog-select"
        >
          <option value="">{available.length === 0 ? 'No more people' : 'Choose a person…'}</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name ? `${p.name} (${p.email})` : p.email}
            </option>
          ))}
        </select>
        <label htmlFor={addRoleId} className="sr-only">
          Role
        </label>
        <select
          id={addRoleId}
          aria-label="Role"
          value={pickRole}
          disabled={busy}
          onChange={(e) => setPickRole(e.target.value as DocPermRole)}
          className="parchment-dialog-select"
        >
          {DOC_PERM_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="parchment-dialog-btn-primary"
          disabled={busy || !pickUserId}
          onClick={() => {
            const id = pickUserId
            setPickUserId('')
            void grant(id, pickRole)
          }}
        >
          Add
        </button>
      </div>

      {error && (
        <p className="parchment-share-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
