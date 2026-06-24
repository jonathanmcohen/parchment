'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { MAX_WORKSPACE_NAME_LEN, normalizeWorkspaceName } from '@/lib/docs/workspace-config'

/**
 * F7: the workspace-name field, wired for real (the control the brief flagged as
 * "types-but-never-saves"). It is a CONTROLLED input bound to
 * GET/PUT /api/settings/workspace (backed by the generic settings store, no DB
 * migration). The value loads on mount and persists on blur / Save, with an
 * inline "Saved" confirmation and an error message on failure.
 */
export function WorkspaceNameSetting() {
  const id = useId()
  const [value, setValue] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The last value we successfully persisted — used to skip no-op saves.
  const lastSavedRef = useRef('')

  useEffect(() => {
    let active = true
    fetch('/api/settings/workspace')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { name?: unknown }) => {
        if (!active) return
        const name = typeof data.name === 'string' ? data.name : ''
        setValue(name)
        lastSavedRef.current = name
      })
      .catch(() => {
        if (active) setError('Could not load the workspace name.')
      })
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  const save = async () => {
    const next = normalizeWorkspaceName(value)
    // Reflect the normalized value in the field so what the user sees matches
    // what was stored.
    setValue(next)
    if (next === lastSavedRef.current) return
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      const res = await fetch('/api/settings/workspace', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: next }),
      })
      if (!res.ok) throw new Error('save failed')
      const data = (await res.json()) as { name?: unknown }
      const stored = typeof data.name === 'string' ? data.name : next
      setValue(stored)
      lastSavedRef.current = stored
      setSaved(true)
    } catch {
      setError('Could not save the workspace name. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium text-sm">
        Workspace name
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={MAX_WORKSPACE_NAME_LEN}
        disabled={!loaded}
        placeholder="My workspace"
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
        }}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void save()
          }
        }}
        className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm disabled:opacity-60"
      />
      <p className="text-[var(--muted)] text-xs" aria-live="polite">
        {saving
          ? 'Saving…'
          : saved
            ? 'Saved.'
            : `Press Enter or click away to save. Up to ${MAX_WORKSPACE_NAME_LEN} characters.`}
      </p>
      {error && (
        <p className="text-[var(--error)] text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
