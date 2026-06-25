'use client'

import { useEffect, useState } from 'react'

// Client island for the Security page "Sessions" section. Read-only: fetches the
// caller's active sessions from GET /api/auth/sessions and lists them, marking
// the one in use. Revoking other sessions is a named follow-up; this view never
// sees a token hash (the server drops it).

type SessionView = {
  id: string
  createdAt: string
  expiresAt: string
  current: boolean
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function SessionsList() {
  const [sessions, setSessions] = useState<SessionView[] | null>(null)
  const [failed, setFailed] = useState(false)

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
          </div>
        </li>
      ))}
    </ul>
  )
}
