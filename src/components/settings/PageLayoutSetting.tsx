'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useState } from 'react'
import type { PageLayoutMode } from '@/lib/docs/settings-repo'

const PAGE_LAYOUT_OPTIONS: { value: PageLayoutMode; label: string; description: string }[] = [
  {
    value: 'continuous',
    label: 'Continuous',
    description: 'One flowing sheet — page breaks shown as subtle divider lines.',
  },
  {
    value: 'paged',
    label: 'Paged',
    description: 'Stronger sheet-edge breaks so each page reads as a separate sheet.',
  },
]

/**
 * v0.1.5: Page-layout mode control — Continuous (default) vs Paged.
 * Client island: GET /api/settings/page-layout on mount, PUT on change, then
 * router.refresh() so the editor re-renders with the new mode on next nav.
 *
 * NOTE: we call the GLOBAL `fetch` directly (never via an object member) so we
 * don't trip the "Illegal invocation" TypeError that comes from a detached
 * `this` binding.
 */
export function PageLayoutSetting() {
  const router = useRouter()
  const groupId = useId()
  const [mode, setMode] = useState<PageLayoutMode>('continuous')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/settings/page-layout')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { mode: PageLayoutMode }) => {
        if (!active) return
        setMode(data.mode === 'paged' ? 'paged' : 'continuous')
      })
      .catch(() => {
        /* keep default on failure */
      })
    return () => {
      active = false
    }
  }, [])

  const save = async (next: PageLayoutMode) => {
    setMode(next)
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/page-layout', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      if (!res.ok) throw new Error('save failed')
      router.refresh()
    } catch {
      setError('Could not save page layout. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <fieldset className="mt-4 border-0 p-0">
      <legend className="font-medium text-sm">Page layout</legend>
      <div className="mt-2 flex flex-col gap-3">
        {PAGE_LAYOUT_OPTIONS.map((opt) => {
          const checked = mode === opt.value
          return (
            <label
              key={opt.value}
              className={[
                'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm',
                checked
                  ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] font-medium'
                  : 'border-[var(--border)] hover:bg-[var(--background)]',
              ].join(' ')}
            >
              <input
                type="radio"
                name={`${groupId}-page-layout`}
                value={opt.value}
                checked={checked}
                disabled={saving}
                onChange={() => save(opt.value)}
                className="mt-0.5 accent-[var(--primary)]"
              />
              <span className="flex flex-col">
                <span>{opt.label}</span>
                <span className="text-[var(--muted)] text-xs font-normal">{opt.description}</span>
              </span>
            </label>
          )
        })}
      </div>
      {error && (
        <p className="mt-2 text-sm" style={{ color: '#dc2626' }} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}
