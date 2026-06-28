'use client'

// G17 + J12: Custom CSS + per-doc THEME dialog — a theme picker (token-only) above
// a raw-CSS textarea, with Apply/Cancel + hint.
// On Apply: persists the per-doc theme (PUT …/theme — token-only, validated) AND the
// custom CSS (PUT …/custom-css), then lifts both into editor state.

import { useId, useState } from 'react'
import { DOC_THEME_PRESETS, type DocTheme } from '@/lib/editor/doc-theme'
import { ACCENT_SWATCHES, PAGE_BG_PRESETS } from '@/lib/editor/theme'

type Props = {
  /** Current custom CSS — seeds the textarea. */
  initial?: string
  /** docId is needed to persist via the API. */
  docId: string
  /** J12: current per-doc theme override — seeds the picker. */
  initialTheme?: DocTheme
  onApply: (css: string) => void
  /** J12: lift the applied theme into editor state so the canvas re-themes live. */
  onApplyTheme?: (theme: DocTheme) => void
  onClose: () => void
}

export function CustomCssDialog({
  initial = '',
  docId,
  initialTheme = {},
  onApply,
  onApplyTheme,
  onClose,
}: Props) {
  const titleId = useId()
  const textareaId = useId()
  const presetId = useId()
  const pageBgId = useId()
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)

  // J12: theme draft (preset / pageBg / accent). '' = inherit workspace.
  const [preset, setPreset] = useState(initialTheme.preset ?? '')
  const [pageBg, setPageBg] = useState(initialTheme.pageBg ?? '')
  const [accent, setAccent] = useState(initialTheme.accent ?? '')

  const buildTheme = (): DocTheme => {
    const t: DocTheme = {}
    if (preset) t.preset = preset
    if (pageBg) t.pageBg = pageBg
    if (accent) t.accent = accent
    return t
  }

  const handleApply = async () => {
    setSaving(true)
    const theme = buildTheme()
    try {
      // Persist the per-doc theme first (token-only, validated server-side).
      const themeRes = await fetch(`/api/docs/${docId}/theme`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme }),
      })
      if (!themeRes.ok) {
        setSaving(false)
        return
      }
      const res = await fetch(`/api/docs/${docId}/custom-css`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ css: value }),
      })
      if (!res.ok) {
        setSaving(false)
        return
      }
    } catch {
      setSaving(false)
      return
    }
    setSaving(false)
    onApplyTheme?.(theme)
    onApply(value)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss on click is standard modal UX
    <div
      role="presentation"
      className="parchment-dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="parchment-dialog parchment-custom-css-dialog"
        onKeyDown={handleKeyDown}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Appearance
          </h2>
          <button
            type="button"
            aria-label="Close custom CSS dialog"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <p className="parchment-dialog-hint">
          Theme + custom CSS for this document only — never affects the app chrome or other
          documents.
        </p>

        {/* J12: per-doc THEME picker (token-only — safe on the share view). */}
        <div className="parchment-dialog-field" data-testid="doc-theme-picker">
          <span className="parchment-dialog-label">Theme</span>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor={presetId} className="text-sm text-[var(--muted)]">
              Preset
            </label>
            <select
              id={presetId}
              value={preset}
              data-testid="doc-theme-preset"
              onChange={(e) => setPreset(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-2 py-1 text-sm"
            >
              <option value="">Inherit workspace</option>
              {DOC_THEME_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>

            <label htmlFor={pageBgId} className="text-sm text-[var(--muted)]">
              Page
            </label>
            <select
              id={pageBgId}
              value={pageBg}
              onChange={(e) => setPageBg(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-2 py-1 text-sm"
            >
              <option value="">Default</option>
              {PAGE_BG_PRESETS.map((p) => (
                <option key={p.key} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--muted)]">Accent</span>
            <button
              type="button"
              aria-label="Inherit accent"
              aria-pressed={accent === ''}
              onClick={() => setAccent('')}
              className="rounded border border-[var(--border)] px-2 py-0.5 text-xs"
            >
              Inherit
            </button>
            {ACCENT_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Accent ${hex}`}
                aria-pressed={accent === hex}
                onClick={() => setAccent(hex)}
                className="h-5 w-5 rounded-full border border-[var(--border)]"
                style={{
                  background: hex,
                  outline: accent === hex ? '2px solid var(--primary)' : 'none',
                  outlineOffset: '1px',
                }}
              />
            ))}
          </div>
        </div>

        <div className="parchment-dialog-field">
          <label htmlFor={textareaId} className="parchment-dialog-label">
            CSS
          </label>
          <textarea
            id={textareaId}
            className="parchment-dialog-input parchment-custom-css-textarea"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`/* Style this document's content */\nh1 { color: navy; }\np { line-height: 1.8; }`}
            rows={12}
            spellCheck={false}
          />
        </div>

        <div className="parchment-dialog-actions">
          <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="parchment-dialog-btn-primary"
            onClick={() => void handleApply()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
