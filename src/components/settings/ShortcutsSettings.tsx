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
  splitCombo,
} from '@/lib/help/keymap'

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)
}

/** Pretty-print a normalized combo for display. */
function formatCombo(combo: string, mac: boolean): string {
  // splitCombo decomposes robustly so a `-`/`+` key (finding E) isn't lost by a
  // naive split('-').
  const { mods, key } = splitCombo(normalizeCombo(combo))
  const pretty: string[] = []
  if (mods.has('Mod')) pretty.push(mac ? '⌘' : 'Ctrl')
  if (mods.has('Shift')) pretty.push(mac ? '⇧' : 'Shift')
  if (mods.has('Alt')) pretty.push(mac ? '⌥' : 'Alt')
  const sep = mac ? ' ' : '+'
  return [...pretty, key.toUpperCase()].join(sep)
}

/**
 * Build a normalized combo string from a recorded keydown event.
 *
 * Finding A: the physical `/` key reports `key:'?'` while Shift is held, so a
 * naive recorder would store `Mod-Shift-?` and DISAGREE with the shipped default
 * `Mod-Shift-/`. We feed the layout-canonical key into normalizeCombo using the
 * SAME signal the dispatcher prefers — the Shift-immune `code` (`Slash` ⇒ `/`)
 * when it resolves, otherwise the printed key folded by normalizeCombo
 * (`?` ⇒ `/`). A freshly recorded ⌘⇧/ therefore yields the identical stored
 * combo as the default, and `-`/`+` (finding E) record as themselves.
 */
function comboFromEvent(e: ComboEvent): string {
  const mods: string[] = []
  if (e.metaKey || e.ctrlKey) mods.push('Mod')
  if (e.shiftKey) mods.push('Shift')
  if (e.altKey) mods.push('Alt')
  const key = keyFromEvent(e)
  return normalizeCombo([...mods, key].join('-'))
}

// Resolve the layout-canonical key character from a recorded event. Prefers the
// Shift-immune physical `code` (matching the dispatcher's matchesCombo), so the
// recorded combo is byte-identical to what the dispatcher will compare against.
const CODE_TO_KEY: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Digit0: '0',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
}

function keyFromEvent(e: ComboEvent): string {
  const code = e.code
  if (code) {
    const punct = CODE_TO_KEY[code]
    if (punct) return punct
    const letter = code.match(/^Key([A-Z])$/)
    if (letter?.[1]) return letter[1].toLowerCase()
  }
  // Fall back to the printed key; normalizeCombo folds `?`→`/`, etc.
  return e.key
}

/** True when the key is purely a modifier (we ignore those during recording). */
function isModifierKey(key: string): boolean {
  return ['Control', 'Meta', 'Shift', 'Alt', 'Os', 'OS', 'CapsLock'].includes(key)
}

const customizableDefaults = DEFAULT_BINDINGS.filter((b) => b.customizable)
const readonlyDefaults = DEFAULT_BINDINGS.filter((b) => !b.customizable)

export function ShortcutsSettings() {
  const headingId = useId()
  const liveRegionId = useId()
  const mac = useMemo(() => isMac(), [])

  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [recording, setRecording] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Screen-reader announcement of recording state / the recorded value. Updated
  // when recording starts, captures a combo, or is cancelled.
  const [announcement, setAnnouncement] = useState('')
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
        setAnnouncement('Recording cancelled.')
        return
      }
      const action = recordingRef.current
      if (!action) return
      const combo = comboFromEvent(e)
      setOverrides((prev) => ({ ...prev, [action]: combo }))
      setRecording(null)
      const label = customizableDefaults.find((b) => b.action === action)?.label ?? 'shortcut'
      setAnnouncement(`Recorded ${formatCombo(combo, mac)} for ${label}.`)
    }
    // Capture phase so we intercept before the global dispatcher.
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [recording, mac])

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
    <section aria-labelledby={headingId} className="mt-12 border-t border-[var(--border)] pt-8">
      <h2 id={headingId} className="font-medium text-lg">
        Keyboard shortcuts
      </h2>
      <p className="mt-1 text-[var(--muted)] text-sm">
        Customize the app-level shortcuts. Click a combo to record a new key, then Save. Press
        Escape while recording to cancel.
      </p>

      {/* Screen-reader-only live region: announces recording state + the
          recorded combo so non-sighted users get feedback the visual
          "Press keys…" / combo label otherwise conveys. */}
      <span
        id={liveRegionId}
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {announcement}
      </span>

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
                  <span className="text-xs" style={{ color: 'var(--error)' }} role="alert">
                    conflict
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const next = isRecording ? null : b.action
                    setRecording(next)
                    setAnnouncement(
                      next
                        ? `Recording shortcut for ${b.label}. Press a key combination, or Escape to cancel.`
                        : 'Recording cancelled.',
                    )
                  }}
                  aria-label={`Change shortcut for ${b.label}`}
                  aria-pressed={isRecording}
                  className="min-w-[6rem] rounded-md border border-[var(--border)] px-2 py-1 font-mono text-sm hover:bg-[var(--background)]"
                  style={isConflicting ? { borderColor: 'var(--error)' } : undefined}
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
        <p className="mt-3 text-sm" style={{ color: 'var(--error)' }} role="alert">
          Two actions share the same key. Resolve the conflict before saving for predictable
          behavior.
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-[var(--primary)] px-4 py-2 font-medium text-sm text-[var(--on-primary)] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save shortcuts'}
        </button>
        {error && (
          <span className="text-sm" style={{ color: 'var(--error)' }} role="alert">
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
