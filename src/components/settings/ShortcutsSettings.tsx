'use client'

// I2 — Shortcuts settings (Workspace › Keyboard shortcuts).
//
// Lists the customizable app-level bindings, lets the user RECORD a new combo
// (capture a keydown → normalizeCombo → preview), warns on conflicts via
// findConflicts, and persists via PUT /api/settings/shortcuts. Reset-to-default
// clears an override. Read-only formatting bindings are listed separately, made
// explicit that they are not remappable in v0.1.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  type Binding,
  type ComboEvent,
  DEFAULT_BINDINGS,
  findConflicts,
  mergeBindings,
  normalizeCombo,
} from '@/lib/help/keymap'

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)
}

/** Pretty-print a normalized combo for display. */
function formatCombo(combo: string, mac: boolean): string {
  const parts = combo.split('-')
  const key = parts[parts.length - 1] ?? ''
  const mods = parts.slice(0, -1)
  const pretty: string[] = []
  for (const m of mods) {
    if (m === 'Mod') pretty.push(mac ? '⌘' : 'Ctrl')
    else if (m === 'Shift') pretty.push(mac ? '⇧' : 'Shift')
    else if (m === 'Alt') pretty.push(mac ? '⌥' : 'Alt')
  }
  const sep = mac ? ' ' : '+'
  return [...pretty, key.toUpperCase()].join(sep)
}

/** Build a normalized combo string from a recorded keydown event. */
function comboFromEvent(e: ComboEvent): string {
  const mods: string[] = []
  if (e.metaKey || e.ctrlKey) mods.push('Mod')
  if (e.shiftKey) mods.push('Shift')
  if (e.altKey) mods.push('Alt')
  return normalizeCombo([...mods, e.key].join('-'))
}

/** True when the key is purely a modifier (we ignore those during recording). */
function isModifierKey(key: string): boolean {
  return ['Control', 'Meta', 'Shift', 'Alt', 'Os', 'OS', 'CapsLock'].includes(key)
}

const customizableDefaults = DEFAULT_BINDINGS.filter((b) => b.customizable)
const readonlyDefaults = DEFAULT_BINDINGS.filter((b) => !b.customizable)

export function ShortcutsSettings() {
  const headingId = useId()
  const mac = useMemo(() => isMac(), [])

  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [recording, setRecording] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recordingRef = useRef<string | null>(null)
  recordingRef.current = recording

  // Load persisted overrides on mount.
  useEffect(() => {
    let active = true
    fetch('/api/settings/shortcuts')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { overrides?: Record<string, string> }) => {
        if (active && data.overrides) setOverrides(data.overrides)
      })
      .catch(() => {
        /* keep empty on failure */
      })
    return () => {
      active = false
    }
  }, [])

  // While recording, capture the next non-modifier keydown as the new combo.
  useEffect(() => {
    if (!recording) return
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()
      if (isModifierKey(e.key)) return
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      const action = recordingRef.current
      if (!action) return
      const combo = comboFromEvent(e)
      setOverrides((prev) => ({ ...prev, [action]: combo }))
      setRecording(null)
    }
    // Capture phase so we intercept before the global dispatcher.
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [recording])

  const merged: Binding[] = useMemo(() => mergeBindings(DEFAULT_BINDINGS, overrides), [overrides])
  const conflicts = useMemo(() => findConflicts(merged), [merged])
  const conflictCombos = useMemo(() => new Set(conflicts.map((c) => c.keys)), [conflicts])

  function effectiveCombo(action: string): string {
    const override = overrides[action]
    if (override) return override
    return customizableDefaults.find((b) => b.action === action)?.defaultKeys ?? ''
  }

  function resetBinding(action: string) {
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[action]
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/shortcuts', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ overrides }),
      })
      if (!res.ok) throw new Error('save failed')
      const data = (await res.json()) as { overrides?: Record<string, string> }
      if (data.overrides) setOverrides(data.overrides)
    } catch {
      setError('Could not save shortcuts. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const hasConflict = conflicts.length > 0

  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="font-medium text-lg">
        Keyboard shortcuts
      </h2>
      <p className="mt-1 text-[var(--muted)] text-sm">
        Customize the app-level shortcuts. Click a combo to record a new key, then Save. Press
        Escape while recording to cancel.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {customizableDefaults.map((b) => {
          const combo = effectiveCombo(b.action)
          const isOverridden = b.action in overrides
          const isConflicting = conflictCombos.has(normalizeCombo(combo))
          const isRecording = recording === b.action
          return (
            <li
              key={b.action}
              className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2"
            >
              <span className="text-sm">{b.label}</span>
              <span className="flex items-center gap-2">
                {isConflicting && (
                  <span className="text-xs" style={{ color: '#dc2626' }} role="alert">
                    conflict
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setRecording(isRecording ? null : b.action)}
                  aria-label={`Change shortcut for ${b.label}`}
                  aria-pressed={isRecording}
                  className="min-w-[6rem] rounded-md border border-[var(--border)] px-2 py-1 font-mono text-sm hover:bg-[var(--background)]"
                  style={isConflicting ? { borderColor: '#dc2626' } : undefined}
                >
                  {isRecording ? 'Press keys…' : formatCombo(combo, mac)}
                </button>
                {isOverridden && (
                  <button
                    type="button"
                    onClick={() => resetBinding(b.action)}
                    className="text-[var(--muted)] text-xs underline hover:text-[var(--foreground)]"
                  >
                    Reset
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {hasConflict && (
        <p className="mt-3 text-sm" style={{ color: '#dc2626' }} role="alert">
          Two actions share the same key. Resolve the conflict before saving for predictable
          behavior.
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-[var(--accent-contrast)] px-4 py-2 font-medium text-sm text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save shortcuts'}
        </button>
        {error && (
          <span className="text-sm" style={{ color: '#dc2626' }} role="alert">
            {error}
          </span>
        )}
      </div>

      <h3 className="mt-6 font-medium text-sm">Editor formatting (not customizable in v0.1)</h3>
      <p className="mt-1 text-[var(--muted)] text-xs">
        Bold, italic, and other in-editor formatting keys are provided by the editor and cannot be
        remapped yet.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {readonlyDefaults.map((b) => (
          <li
            key={b.action}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-[var(--muted)] text-xs"
          >
            <span className="font-mono">{formatCombo(b.defaultKeys, mac)}</span> — {b.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
