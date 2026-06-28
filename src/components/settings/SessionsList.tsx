'use client'

import { useEffect, useState } from 'react'

// Client island for the Security page "Sessions" section. Lists the caller's active
// sessions (GET /api/auth/sessions), marks the one in use, and lets the user REVOKE
// any of them (DELETE /api/auth/sessions/[id]). This view never sees a token hash
// (the server drops it). Revoking the current session signs the user out, so that
// row asks for confirmation first.

type SessionView = {
  id: string
  createdAt: string
  expiresAt: string
  current: boolean
}

type FetchDep = { fetch?: typeof fetch }

export type RevokeResult = { ok: true } | { ok: false; status: number }

// Injectable handler (testable without JSX): DELETE one session by id. Uses the
// GLOBAL fetch by default; a hoisted local avoids the `this`-binding pitfall (a
// member call `deps.fetch(...)` would bind `this` to deps → "Illegal invocation").
export async function revokeSessionRequest(id: string, deps: FetchDep = {}): Promise<RevokeResult> {
  const doFetch = deps.fetch ?? fetch
  const res = await doFetch(`/api/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return res.ok ? { ok: true } : { ok: false, status: res.status }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function SessionsList() {
  const [sessions, setSessions] = useState<SessionView[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load(): Promise<void> {
    try {
      const res = await fetch('/api/auth/sessions')
      if (!res.ok) {
        setFailed(true)
        return
      }
      const data = (await res.json()) as { sessions: SessionView[] }
      setSessions(data.sessions)
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const res = await fetch('/api/auth/sessions')
        if (!res.ok) {
          if (active) setFailed(true)
          return
        }
        const data = (await res.json()) as { sessions: SessionView[] }
        if (active) setSessions(data.sessions)
      } catch {
        if (active) setFailed(true)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  async function handleRevoke(s: SessionView): Promise<void> {
    if (s.current) {
      const confirmed = window.confirm(
        'Sign out of this device? You will be returned to the login page.',
      )
      if (!confirmed) return
    }
    setBusyId(s.id)
    const result = await revokeSessionRequest(s.id)
    if (result.ok) {
      if (s.current) {
        // Revoking the current session logged us out — the next request is dead.
        window.location.assign('/login')
        return
      }
      // Optimistic remove.
      setSessions((prev) => (prev ? prev.filter((x) => x.id !== s.id) : prev))
      setBusyId(null)
    } else {
      // Refetch on error so the list reflects reality.
      setBusyId(null)
      await load()
    }
  }

  if (failed) {
    return <p className="mt-4 text-[var(--muted)] text-sm">Could not load your active sessions.</p>
  }

  if (sessions === null) {
    return <p className="mt-4 text-[var(--muted)] text-sm">Loading sessions…</p>
  }

  if (sessions.length === 0) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 py-8 text-center text-[var(--muted)]">
        <span aria-hidden className="material-symbols-rounded text-[24px]">
          devices
        </span>
        <p className="text-sm">No active sessions.</p>
      </div>
    )
  }

  return (
    <ul className="mt-4 flex flex-col gap-2">
      {sessions.map((s) => (
        <li key={s.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                {s.current ? 'This device' : 'Signed-in session'}
                {s.current ? (
                  <span className="ml-2 rounded bg-[var(--primary)] px-1.5 py-0.5 text-[var(--on-primary)] text-xs">
                    current
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-[var(--muted)] text-xs">
                Started {formatDate(s.createdAt)} · expires {formatDate(s.expiresAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRevoke(s)}
              disabled={busyId === s.id}
              aria-label={s.current ? 'Sign out of this device' : 'Revoke this session'}
              className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--background)] disabled:opacity-60"
            >
              {busyId === s.id ? '…' : s.current ? 'Sign out' : 'Revoke'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
