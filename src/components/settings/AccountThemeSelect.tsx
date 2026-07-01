'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useState } from 'react'
import { applyColorScheme } from '@/components/settings/account-theme-handler'
import { DEFAULT_THEME, type WorkspaceTheme } from '@/lib/editor/theme'

/**
 * F1: Account → Appearance color-scheme control.
 *
 * The Account page's Theme section is a focused single control (scheme only),
 * distinct from the Workspace page's full AppearanceSettings (accent / font /
 * page-bg / accessibility). This client island makes that control actually
 * re-theme + persist, reusing the same endpoint + the AppearanceSettings pattern
 * (onChange → PUT /api/settings/theme → router.refresh()) — no new backend.
 *
 * It loads the *full* stored theme on mount so a scheme change merges over it
 * rather than resetting accent / font / pageBg to defaults (see
 * applyColorScheme).
 */
export function AccountThemeSelect() {
  const router = useRouter()
  const selectId = useId()
  const [theme, setTheme] = useState<WorkspaceTheme>(DEFAULT_THEME)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/settings/theme')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: WorkspaceTheme) => {
        if (!active) return
        // K2/I1 legacy-compat: older stored themes may omit newer fields.
        setTheme({
          accent: data.accent ?? DEFAULT_THEME.accent,
          fontPair: data.fontPair ?? DEFAULT_THEME.fontPair,
          colorScheme: data.colorScheme ?? DEFAULT_THEME.colorScheme,
          pageBg: data.pageBg ?? DEFAULT_THEME.pageBg,
          highContrast: data.highContrast ?? DEFAULT_THEME.highContrast,
          dyslexicFont: data.dyslexicFont ?? DEFAULT_THEME.dyslexicFont,
          defaultBodyFont: data.defaultBodyFont ?? DEFAULT_THEME.defaultBodyFont,
        })
      })
      .catch(() => {
        /* keep defaults on failure */
      })
    return () => {
      active = false
    }
  }, [])

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const scheme = e.target.value as WorkspaceTheme['colorScheme']
    setSaving(true)
    setError(null)
    try {
      const next = await applyColorScheme(theme, scheme, { fetch, router })
      setTheme(next)
    } catch (err) {
      // CF1: surface the underlying status/message so a deploy-time failure is
      // visible (e.g. "save failed (HTTP 401)") rather than an opaque retry hint.
      const detail = err instanceof Error ? err.message : String(err)
      setError(`Could not save appearance: ${detail}. Try again.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <label htmlFor={selectId} className="font-medium text-sm">
        Appearance
      </label>
      <select
        id={selectId}
        name="theme"
        value={theme.colorScheme}
        disabled={saving}
        onChange={onChange}
        className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm disabled:opacity-60"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      {error && (
        <p className="text-sm" style={{ color: 'var(--error)' }} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
