'use client'

import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'

/**
 * V2: Account → Profile display-name control.
 *
 * The Account page previously rendered a bare uncontrolled <input defaultValue>
 * with NO save path — edits were silently lost. This island makes it actually
 * persist: save on blur or Enter via PUT /api/settings/profile, then
 * router.refresh() so the server tree (and anywhere the name is shown) updates.
 *
 * Note: this calls the GLOBAL `fetch` directly. The F1/CF1 AccountThemeSelect bug
 * (V0) was passing `fetch` into an object and calling it as a member — which
 * binds `this` to that object and makes window.fetch throw "Illegal invocation".
 * An unqualified `fetch(...)` here keeps `this` === undefined, which is fine.
 */
export function AccountNameSetting({ initialName }: { initialName: string }) {
  const router = useRouter()
  const inputId = useId()
  const [name, setName] = useState(initialName)
  // The last value successfully persisted — used to skip no-op saves on blur.
  const savedRef = useRef(initialName)
  const [saving, setSaving] = useState(false)
  const [savedTick, setSavedTick] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setError('Display name can’t be empty.')
      setName(savedRef.current) // revert the empty edit
      return
    }
    if (trimmed === savedRef.current) return // nothing changed

    setSaving(true)
    setSavedTick(false)
    setError(null)
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      savedRef.current = trimmed
      setName(trimmed)
      setSavedTick(true)
      router.refresh()
    } catch {
      setError('Could not save your name. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="font-medium text-sm">
        Display name
      </label>
      <input
        id={inputId}
        name="name"
        type="text"
        autoComplete="name"
        value={name}
        disabled={saving}
        onChange={(e) => {
          setName(e.target.value)
          setSavedTick(false)
          setError(null)
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur() // triggers onBlur → save
          }
        }}
        className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm disabled:opacity-60"
      />
      {savedTick && !error && <p className="text-[var(--muted)] text-xs">Saved.</p>}
      {error && (
        <p className="text-xs" style={{ color: 'var(--error)' }} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
