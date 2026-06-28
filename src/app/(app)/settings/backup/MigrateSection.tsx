'use client'

import { useState } from 'react'

// D — instance migration UI. Token management (generate/revoke) + push to another
// instance (dry-run / migrate now).

export function MigrateSection({ initialConfigured }: { initialConfigured: boolean }) {
  const [configured, setConfigured] = useState(initialConfigured)
  const [token, setToken] = useState<string | null>(null)
  const [targetUrl, setTargetUrl] = useState('')
  const [pushToken, setPushToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function generate() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/settings/backup/migrate-token', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string }
      if (!res.ok || !data.token) {
        setMsg({ kind: 'error', text: data.error ?? 'Could not generate a token.' })
        return
      }
      setToken(data.token)
      setConfigured(true)
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    setBusy(true)
    setMsg(null)
    try {
      await fetch('/api/settings/backup/migrate-token', { method: 'DELETE' })
      setToken(null)
      setConfigured(false)
      setMsg({ kind: 'ok', text: 'Receive token revoked.' })
    } finally {
      setBusy(false)
    }
  }

  async function push(dry: boolean) {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch(`/api/migrate/push${dry ? '?dry=true' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, token: pushToken }),
      })
      const data = (await r.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        created?: number
        wouldCreate?: number
        existingCount?: number
        targetStatus?: number
      }
      if (!r.ok || data.ok === false) {
        setMsg({
          kind: 'error',
          text: data.error ?? `Target responded ${data.targetStatus ?? r.status}.`,
        })
        return
      }
      setMsg({
        kind: 'ok',
        text: dry
          ? `Dry run: would create ${data.wouldCreate ?? 0} (target has ${data.existingCount ?? 0}).`
          : `Migrated: created ${data.created ?? 0}.`,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 flex max-w-md flex-col gap-4">
      <div>
        <p className="text-[var(--muted)] text-sm">
          Receive endpoint: <strong>{configured ? 'open' : 'closed'}</strong>
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--background)] disabled:opacity-60"
          >
            Generate receive token
          </button>
          {configured ? (
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--paper)] disabled:opacity-60"
            >
              Revoke token
            </button>
          ) : null}
        </div>
        {token ? (
          <p className="mt-2 break-all rounded-md border border-[var(--border)] bg-[var(--paper)] p-2 font-mono text-xs">
            Copy this token now — it is shown only once: {token}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="mig-target" className="font-medium text-sm">
          Target URL
        </label>
        <input
          id="mig-target"
          type="url"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://other-instance.example"
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 text-sm"
        />
        <label htmlFor="mig-token" className="font-medium text-sm">
          Token
        </label>
        <input
          id="mig-token"
          type="password"
          value={pushToken}
          onChange={(e) => setPushToken(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => push(true)}
            disabled={busy}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--paper)] disabled:opacity-60"
          >
            Test connection (dry run)
          </button>
          <button
            type="button"
            onClick={() => push(false)}
            disabled={busy}
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--background)] disabled:opacity-60"
          >
            Migrate now
          </button>
        </div>
      </div>

      {msg ? (
        <p
          role={msg.kind === 'error' ? 'alert' : 'status'}
          className="text-sm"
          style={{ color: msg.kind === 'error' ? 'var(--error)' : 'var(--success)' }}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  )
}
