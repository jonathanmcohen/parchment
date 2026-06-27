'use client'

import { useState } from 'react'

// F1 — restore-from-S3 picker. Lists backup objects in the bucket, lets the
// admin pick one and restore it.

interface S3Object {
  key: string
  lastModified: string | null
  size: number
}

export function S3ObjectPicker() {
  const [open, setOpen] = useState(false)
  const [objects, setObjects] = useState<S3Object[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function load() {
    setOpen(true)
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/settings/backup/s3/objects')
      const data = (await res.json().catch(() => ({}))) as {
        objects?: S3Object[]
        error?: string
      }
      if (!res.ok) {
        setMsg({ kind: 'error', text: data.error ?? 'Could not list backups.' })
        return
      }
      setObjects(data.objects ?? [])
    } catch {
      setMsg({ kind: 'error', text: 'Could not list backups.' })
    } finally {
      setBusy(false)
    }
  }

  async function restore(key: string) {
    if (!confirm(`Restore from "${key}"? This creates new documents.`)) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/settings/backup/s3/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        created?: number
        error?: string
      }
      setMsg(
        res.ok
          ? { kind: 'ok', text: `Restored ${data.created ?? 0} document(s).` }
          : { kind: 'error', text: data.error ?? 'Restore failed.' },
      )
    } catch {
      setMsg({ kind: 'error', text: 'Restore failed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={load}
        className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--background)]"
      >
        Restore from S3…
      </button>
      {open ? (
        <div className="mt-3 rounded-md border border-[var(--border)] p-3">
          {busy ? <p className="text-[var(--muted)] text-sm">Loading…</p> : null}
          {objects.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {objects.map((o) => (
                <li key={o.key} className="flex items-center justify-between gap-3">
                  <span className="truncate">{o.key}</span>
                  <button
                    type="button"
                    onClick={() => restore(o.key)}
                    disabled={busy}
                    className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--paper)]"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          ) : !busy ? (
            <p className="text-[var(--muted)] text-sm">No backups found.</p>
          ) : null}
        </div>
      ) : null}
      {msg ? (
        <p
          role={msg.kind === 'error' ? 'alert' : 'status'}
          className="mt-2 text-sm"
          style={{ color: msg.kind === 'error' ? 'var(--error)' : 'var(--success)' }}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  )
}
