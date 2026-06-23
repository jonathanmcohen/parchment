'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useState } from 'react'
import {
  ACCENT_SWATCHES,
  DEFAULT_THEME,
  FONT_PAIRS,
  PAGE_BG_PRESETS,
  resolvePageBg,
  type WorkspaceTheme,
} from '@/lib/editor/theme'

const COLOR_SCHEME_OPTIONS: { value: WorkspaceTheme['colorScheme']; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/**
 * I1: Appearance section — color scheme, accent (8 swatches + custom hex),
 * page background (preset + custom hex), and font-pair gallery.
 * Extends G3's accent + font-pair controls.
 */
export function AppearanceSettings() {
  const router = useRouter()
  const [theme, setTheme] = useState<WorkspaceTheme>(DEFAULT_THEME)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customAccent, setCustomAccent] = useState('')
  const [customPageBg, setCustomPageBg] = useState('')

  const schemeGroupId = useId()
  const pageBgGroupId = useId()

  useEffect(() => {
    let active = true
    fetch('/api/settings/theme')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: WorkspaceTheme) => {
        if (!active) return
        setTheme({
          accent: data.accent,
          fontPair: data.fontPair,
          colorScheme: data.colorScheme ?? DEFAULT_THEME.colorScheme,
          pageBg: data.pageBg ?? DEFAULT_THEME.pageBg,
          // K2: legacy-compat — themes stored before K2 omit these booleans.
          highContrast: data.highContrast ?? DEFAULT_THEME.highContrast,
          dyslexicFont: data.dyslexicFont ?? DEFAULT_THEME.dyslexicFont,
        })
        // Pre-fill custom inputs if the stored value is not a preset.
        const isPresetAccent = ACCENT_SWATCHES.includes(data.accent)
        if (!isPresetAccent) setCustomAccent(data.accent)
        const isPresetBg = PAGE_BG_PRESETS.some((p) => p.value === data.pageBg)
        if (!isPresetBg && data.pageBg) setCustomPageBg(data.pageBg)
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
        Color scheme, accent color, page background, font pairing, and accessibility.
      </p>

      {/* ── Color scheme ── */}
      <fieldset className="mt-6 border-0 p-0">
        <legend className="font-medium text-sm">Color scheme</legend>
        <div className="mt-2 flex gap-3">
          {COLOR_SCHEME_OPTIONS.map((opt) => {
            const checked = theme.colorScheme === opt.value
            return (
              <label
                key={opt.value}
                className={[
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  checked
                    ? 'border-[var(--accent-contrast)] bg-[color-mix(in_srgb,var(--accent-contrast)_10%,transparent)] font-medium'
                    : 'border-[var(--border)] hover:bg-[var(--background)]',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <input
                  type="radio"
                  name={`${schemeGroupId}-scheme`}
                  value={opt.value}
                  checked={checked}
                  disabled={saving}
                  onChange={() => save({ ...theme, colorScheme: opt.value })}
                  className="accent-[var(--accent-contrast)]"
                />
                {opt.label}
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* ── Accent color ── */}
      <fieldset className="mt-6 border-0 p-0">
        <legend className="font-medium text-sm">Accent color</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ACCENT_SWATCHES.map((swatch) => {
            const selected = theme.accent === swatch
            return (
              <button
                key={swatch}
                type="button"
                aria-label={`Accent ${swatch}`}
                aria-pressed={selected}
                disabled={saving}
                onClick={() => save({ ...theme, accent: swatch })}
                style={{ backgroundColor: swatch }}
                className={[
                  'h-7 w-7 rounded-full border-2 transition-transform focus-visible:outline-2 focus-visible:outline-[var(--accent-contrast)] focus-visible:outline-offset-2',
                  selected ? 'scale-110 border-white shadow-md' : 'border-transparent',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            )
          })}

          {/* Live-preview chip + custom hex input */}
          <div className="flex items-center gap-2">
            <span
              className="h-7 w-7 rounded-full border-2 border-[var(--border)]"
              style={{ backgroundColor: customAccent || theme.accent }}
              aria-hidden="true"
            />
            <input
              type="color"
              aria-label="Custom accent color"
              value={customAccent || theme.accent}
              disabled={saving}
              onChange={(e) => {
                setCustomAccent(e.target.value)
              }}
              onBlur={(e) => {
                if (e.target.value !== theme.accent) {
                  void save({ ...theme, accent: e.target.value })
                }
              }}
              className="h-7 w-10 cursor-pointer rounded border border-[var(--border)] bg-[var(--paper)] p-0.5"
            />
          </div>
        </div>
      </fieldset>

      {/* ── Page background ── */}
      <fieldset className="mt-6 border-0 p-0">
        <legend className="font-medium text-sm">Page background</legend>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {PAGE_BG_PRESETS.map((preset) => {
            const selected = theme.pageBg === preset.value
            return (
              <label
                key={preset.key}
                className={[
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  selected
                    ? 'border-[var(--accent-contrast)] bg-[color-mix(in_srgb,var(--accent-contrast)_10%,transparent)] font-medium'
                    : 'border-[var(--border)] hover:bg-[var(--background)]',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <input
                  type="radio"
                  name={`${pageBgGroupId}-pageBg`}
                  value={preset.value}
                  checked={selected}
                  disabled={saving}
                  onChange={() => save({ ...theme, pageBg: preset.value })}
                  className="accent-[var(--accent-contrast)]"
                />
                {preset.label}
              </label>
            )
          })}

          {/* Custom hex page-bg */}
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Custom page background color"
              value={customPageBg || resolvePageBg(theme.pageBg)}
              disabled={saving}
              onChange={(e) => {
                setCustomPageBg(e.target.value)
              }}
              onBlur={(e) => {
                // Only save when a custom (non-preset) value has been chosen and
                // it differs from what is already stored — compare resolved hex so
                // preset keywords ('white', 'sepia') are not overwritten by their
                // hex equivalents on accidental focus+blur.
                if (customPageBg && resolvePageBg(e.target.value) !== resolvePageBg(theme.pageBg)) {
                  void save({ ...theme, pageBg: e.target.value })
                }
              }}
              className="h-7 w-10 cursor-pointer rounded border border-[var(--border)] bg-[var(--paper)] p-0.5"
            />
            <span className="text-[var(--muted)] text-xs">Custom</span>
          </div>
        </div>
      </fieldset>

      {/* ── Font pair gallery ── */}
      <fieldset className="mt-6 border-0 p-0">
        <legend className="font-medium text-sm">Font pair</legend>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FONT_PAIRS.map((pair) => {
            const selected = theme.fontPair === pair.key
            return (
              <button
                key={pair.key}
                type="button"
                aria-pressed={selected}
                disabled={saving}
                onClick={() => save({ ...theme, fontPair: pair.key })}
                className={[
                  'flex flex-col rounded-md border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent-contrast)] focus-visible:outline-offset-2',
                  selected
                    ? 'border-[var(--accent-contrast)] bg-[color-mix(in_srgb,var(--accent-contrast)_10%,transparent)]'
                    : 'border-[var(--border)] hover:bg-[var(--background)]',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {/* Heading preview */}
                <span
                  className="truncate text-sm font-semibold"
                  style={{ fontFamily: pair.heading }}
                >
                  {pair.name}
                </span>
                {/* Body preview — use full-contrast foreground on the selected
                    card (its accent-tinted background drops --muted below AA). */}
                <span
                  className={[
                    'mt-1 truncate text-xs',
                    selected ? 'text-[var(--foreground)]' : 'text-[var(--muted)]',
                  ].join(' ')}
                  style={{ fontFamily: pair.body }}
                >
                  The quick brown fox
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* ── K2: Accessibility ── */}
      <fieldset className="mt-6 border-0 p-0">
        <legend className="font-medium text-sm">Accessibility</legend>
        <div className="mt-2 flex flex-col gap-3">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={theme.highContrast}
              disabled={saving}
              onChange={(e) => save({ ...theme, highContrast: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-[var(--accent-contrast)]"
            />
            <span className="flex flex-col">
              <span className="font-medium">High contrast</span>
              <span className="text-[var(--muted)] text-xs">
                Maximum-contrast colours (WCAG AAA). Layers on top of your light or dark scheme.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={theme.dyslexicFont}
              disabled={saving}
              onChange={(e) => save({ ...theme, dyslexicFont: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-[var(--accent-contrast)]"
            />
            <span className="flex flex-col">
              <span className="font-medium">Dyslexia-friendly font (OpenDyslexic)</span>
              <span className="text-[var(--muted)] text-xs">
                Switches the interface and document text to the OpenDyslexic typeface.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {error && (
        <p className="mt-2 text-sm" style={{ color: '#dc2626' }} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
