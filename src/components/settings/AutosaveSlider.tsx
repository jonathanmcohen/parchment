'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  clampAutosaveMs,
  DEFAULT_AUTOSAVE_MS,
  MAX_AUTOSAVE_MS,
  MIN_AUTOSAVE_MS,
} from '@/lib/docs/autosave-config'

/** Format ms as a human-readable string: "5s", "30s", "2 min", "5 min". */
function formatMs(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

/**
 * I3: Autosave cadence slider (5s–5min).
 * Debounces PUT /api/settings/autosave by 600ms to avoid hammering the server
 * while the user is dragging.
 */
export function AutosaveSlider() {
  const inputId = useId()
  const [ms, setMs] = useState(DEFAULT_AUTOSAVE_MS)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/settings/autosave')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { ms: number }) => {
        if (!active) return
        setMs(clampAutosaveMs(data.ms))
      })
      .catch(() => {
        /* keep default on failure */
      })
    return () => {
      active = false
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = clampAutosaveMs(Number(e.target.value))
    setMs(next)
    setError(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        const res = await fetch('/api/settings/autosave', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ms: next }),
        })
        if (!res.ok) throw new Error('save failed')
      } catch {
        setError('Could not save autosave interval. Try again.')
      } finally {
        setSaving(false)
      }
    }, 600)
  }

  const label = formatMs(ms)

  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="font-medium text-sm">
          Autosave interval
        </label>
        <span className="font-mono text-[var(--muted)] text-sm" aria-live="polite">
          {saving ? 'Saving…' : label}
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={MIN_AUTOSAVE_MS}
        max={MAX_AUTOSAVE_MS}
        step={5_000}
        value={ms}
        onChange={handleChange}
        aria-valuemin={MIN_AUTOSAVE_MS}
        aria-valuemax={MAX_AUTOSAVE_MS}
        aria-valuenow={ms}
        aria-valuetext={label}
        className="w-full accent-[var(--primary)]"
      />
      <div className="flex justify-between text-[var(--muted)] text-xs">
        <span>5s</span>
        <span>5 min</span>
      </div>
      {error && (
        <p className="text-sm" style={{ color: 'var(--error)' }} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
