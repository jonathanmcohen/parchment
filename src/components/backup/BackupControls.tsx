'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useRef, useState, useTransition } from 'react'

// I4 — client islands for the admin Backup page: a restore upload form and the
// "Back up to S3 now" trigger. The "Download backup" control is a plain link
// (server-rendered) so it needs no JS.

interface RestoreResponse {
  created: number
  skipped: number
  warnings: string[]
}

/** Restore-from-backup: upload a .zip, show created / skipped / warnings. */
export function RestoreForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RestoreResponse | null>(null)
  const [, startTransition] = useTransition()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = inputRef.current?.files?.[0]
    if (!file) {
      setError('Choose a backup .zip first.')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/backup/restore', { method: 'POST', body: fd })
      const data = (await res.json()) as RestoreResponse & { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Restore failed.')
        return
      }
      setResult({ created: data.created, skipped: data.skipped, warnings: data.warnings ?? [] })
      startTransition(() => router.refresh())
    } catch {
      setError('Restore failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
      <label htmlFor="backup-file" className="font-medium text-sm">
        Backup file (.zip)
      </label>
      <input
        ref={inputRef}
        id="backup-file"
        name="file"
        type="file"
        accept=".zip,application/zip"
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-[var(--border)] file:bg-[var(--paper)] file:px-3 file:py-1.5 file:font-medium file:text-sm"
      />
      <div>
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Restoring…' : 'Restore from backup'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      ) : null}
      {result ? (
        <div
          role="status"
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] p-3 text-sm"
        >
          <p>
            Restored <strong>{result.created}</strong> document
            {result.created === 1 ? '' : 's'}
            {result.skipped > 0 ? (
              <>
                {' '}
                — <strong>{result.skipped}</strong> skipped
              </>
            ) : null}
            .
          </p>
          {result.warnings.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-[var(--muted)]">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}

/** "Back up to S3 now": POSTs the admin trigger, refreshes the page state. */
export function S3BackupNowButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [, startTransition] = useTransition()

  async function handleClick() {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const res = await fetch('/api/backup/s3-now', { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error === 's3_not_configured' ? 'S3 is not configured.' : 'Backup failed.')
        return
      }
      setDone(true)
      startTransition(() => router.refresh())
    } catch {
      setError('Backup failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
        className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Backing up…' : 'Back up to S3 now'}
      </button>
      {error ? (
        <span role="alert" className="text-sm" style={{ color: 'var(--error)' }}>
          {error}
        </span>
      ) : null}
      {done && !error ? (
        <span role="status" className="text-sm" style={{ color: 'var(--success)' }}>
          Backup triggered.
        </span>
      ) : null}
    </div>
  )
}
