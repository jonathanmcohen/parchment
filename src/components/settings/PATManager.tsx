'use client'

import { useCallback, useEffect, useState } from 'react'

// Client island for the Developer settings "Personal access tokens" section.
// Mirrors WebhooksManager: all secret handling is server-side — the plaintext
// token is returned EXACTLY ONCE by the create (POST) response and shown here a
// single time with a copy button + a "store it now" warning. The list (GET) only
// ever shows the safe `tokenPrefix`. This component never imports @/db and never
// re-fetches a minted token.

type Pat = {
  id: string
  name: string
  tokenPrefix: string
  lastUsedAt: string | null
  createdAt: string
}

type CreatedPat = {
  id: string
  name: string
  tokenPrefix: string
  // Plaintext token — present only in the create response, shown once.
  token: string
}

export function PATManager() {
  const [pats, setPats] = useState<Pat[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The freshly-minted token. Cleared whenever the list refreshes / on revoke.
  const [newToken, setNewToken] = useState<{ id: string; token: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/auth/pat')
    const data = res.ok ? ((await res.json()) as { pats: Pat[] }) : { pats: [] }
    setPats(data.pats)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const res = await fetch('/api/auth/pat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        setError('Could not create the token. Give it a name and try again.')
        return
      }
      const created = (await res.json()) as CreatedPat
      setNewToken({ id: created.id, token: created.token })
      setName('')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/auth/pat/${id}`, { method: 'DELETE' })
      if (res.ok) {
        if (newToken?.id === id) setNewToken(null)
        await refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  async function copyToken() {
    if (!newToken) return
    try {
      await navigator.clipboard.writeText(newToken.token)
      setCopied(true)
    } catch {
      // Clipboard may be unavailable (insecure context); the token stays visible
      // for a manual copy.
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <form onSubmit={create} className="rounded-lg border border-[var(--border)] p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="pat-name" className="font-medium text-sm">
            Token name
          </label>
          <input
            id="pat-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CI deploy, laptop script"
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy || name.trim().length === 0}
          className="mt-3 rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm text-[var(--on-primary)] disabled:opacity-60"
        >
          Generate token
        </button>
      </form>

      {newToken ? (
        <div className="rounded-md border border-[var(--accent)] border-dashed p-3">
          <p className="font-medium text-sm">New token — store it now</p>
          <p className="text-[var(--muted)] text-xs">
            Copy this token now. For your security it is shown only once and cannot be retrieved
            later. Send it as an <code>Authorization: Bearer …</code> header.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="block flex-1 break-all font-mono text-sm">{newToken.token}</code>
            <button
              type="button"
              onClick={copyToken}
              className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-[var(--accent)] text-sm">
          {error}
        </p>
      ) : null}

      {pats && pats.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {pats.map((p) => (
            <li key={p.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="mt-1 text-[var(--muted)] text-xs">
                    <code className="font-mono">{p.tokenPrefix}…</code> · created{' '}
                    {new Date(p.createdAt).toLocaleDateString()} ·{' '}
                    {p.lastUsedAt
                      ? `last used ${new Date(p.lastUsedAt).toLocaleDateString()}`
                      : 'never used'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(p.id)}
                  disabled={busy}
                  className="shrink-0 text-[var(--muted)] underline-offset-2 hover:underline disabled:opacity-60"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-[var(--muted)]">
          <span aria-hidden className="material-symbols-rounded text-[24px]">
            key
          </span>
          <p className="text-sm">
            No tokens yet. Generate one above to authenticate API requests on your behalf.
          </p>
        </div>
      )}
    </div>
  )
}
