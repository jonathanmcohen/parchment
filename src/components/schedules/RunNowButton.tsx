'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * I10 — per-job "Run now" client island. POSTs the run route, then refreshes the
 * server component so the freshly-updated state (last run / status / run count)
 * re-renders. Disabled + announces while in flight.
 */
export function RunNowButton({ name }: { name: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const running = busy || isPending

  async function handleClick() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/schedules/${encodeURIComponent(name)}/run`, { method: 'POST' })
      if (!res.ok) throw new Error('run failed')
      startTransition(() => router.refresh())
    } catch {
      setError('Failed to run')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={running}
        aria-busy={running}
        className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1 font-medium text-sm hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? 'Running…' : 'Run now'}
      </button>
      {error ? (
        <span role="alert" className="text-xs" style={{ color: 'var(--error)' }}>
          {error}
        </span>
      ) : null}
    </span>
  )
}
