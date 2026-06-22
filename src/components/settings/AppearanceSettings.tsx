'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DEFAULT_THEME, FONT_PAIRS, type WorkspaceTheme } from '@/lib/editor/theme'

/**
 * G3: Appearance section — the workspace theme (accent color + font pair).
 * Self-fetches the current theme, PUTs changes to /api/settings/theme, and
 * calls router.refresh() so the layout re-injects the new CSS vars.
 */
export function AppearanceSettings() {
  const router = useRouter()
  const [theme, setTheme] = useState<WorkspaceTheme>(DEFAULT_THEME)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/settings/theme')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: WorkspaceTheme) => {
        if (active) setTheme({ accent: data.accent, fontPair: data.fontPair })
      })
      .catch(() => {
        /* keep defaults on failure */
      })
    return () => {
      active = false
    }
  }, [])

  const save = async (next: WorkspaceTheme) => {
    setTheme(next)
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/theme', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) throw new Error('save failed')
      router.refresh()
    } catch {
      setError('Could not save appearance. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="workspace-appearance" className="mt-8">
      <h2 id="workspace-appearance" className="font-medium text-lg">
        Appearance
      </h2>
      <p className="mt-1 text-[var(--muted)] text-sm">
        The accent color and font pairing applied across the workspace.
      </p>

      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor="theme-accent" className="font-medium text-sm">
          Accent color
        </label>
        <input
          id="theme-accent"
          name="accent"
          type="color"
          value={theme.accent}
          disabled={saving}
          onChange={(e) => save({ ...theme, accent: e.target.value })}
          className="h-9 w-16 rounded-md border border-[var(--border)] bg-[var(--paper)]"
        />
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor="theme-font-pair" className="font-medium text-sm">
          Font pair
        </label>
        <select
          id="theme-font-pair"
          name="fontPair"
          value={theme.fontPair}
          disabled={saving}
          onChange={(e) => save({ ...theme, fontPair: e.target.value })}
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
        >
          {FONT_PAIRS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mt-2 text-sm" style={{ color: '#dc2626' }} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
