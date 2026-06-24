'use client'

import { useEffect, useId, useState } from 'react'
import type { NamedStyle } from '@/lib/editor/styles'

/** Generate a stable-enough id for a new style from its name. */
function makeId(name: string, existing: readonly NamedStyle[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'style'
  let id = base
  let n = 1
  const taken = new Set(existing.map((s) => s.id))
  while (taken.has(id)) {
    n += 1
    id = `${base}-${n}`
  }
  return id
}

type DraftType = 'paragraph' | 'character'

/**
 * G3: minimal named-styles manager. Lists the workspace styles, lets you add a
 * style (name + type + a few props + optional basedOn) and delete one. Persists
 * the whole list to /api/settings/styles; the editor dropdown picks up changes
 * on its next load.
 */
export function StylesManager() {
  const fieldId = useId()
  const [styles, setStyles] = useState<NamedStyle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New-style draft.
  const [name, setName] = useState('')
  const [type, setType] = useState<DraftType>('paragraph')
  const [fontFamily, setFontFamily] = useState('')
  const [fontSize, setFontSize] = useState('')
  const [color, setColor] = useState('#000000')
  const [useColor, setUseColor] = useState(false)
  const [bold, setBold] = useState(false)
  const [italic, setItalic] = useState(false)
  const [underline, setUnderline] = useState(false)
  const [basedOn, setBasedOn] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/settings/styles')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { styles?: NamedStyle[] }) => {
        if (active && Array.isArray(data.styles)) setStyles(data.styles)
      })
      .catch(() => setError('Could not load styles.'))
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  const persist = async (next: NamedStyle[]) => {
    setStyles(next)
    setError(null)
    try {
      const res = await fetch('/api/settings/styles', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ styles: next }),
      })
      if (!res.ok) throw new Error('save failed')
      const data = (await res.json()) as { styles?: NamedStyle[] }
      if (Array.isArray(data.styles)) setStyles(data.styles)
    } catch {
      setError('Could not save styles. Try again.')
    }
  }

  const addStyle = () => {
    const trimmed = name.trim()
    if (trimmed === '') {
      setError('A style needs a name.')
      return
    }
    const props: NamedStyle['props'] = {}
    if (fontFamily !== '') props.fontFamily = fontFamily
    if (fontSize.trim() !== '') props.fontSize = fontSize.trim()
    if (useColor) props.color = color
    if (bold) props.bold = true
    if (italic) props.italic = true
    if (underline) props.underline = true

    const style: NamedStyle = { id: makeId(trimmed, styles), name: trimmed, type, props }
    if (basedOn !== '') style.basedOn = basedOn

    void persist([...styles, style])
    // Reset the draft.
    setName('')
    setFontFamily('')
    setFontSize('')
    setUseColor(false)
    setBold(false)
    setItalic(false)
    setUnderline(false)
    setBasedOn('')
  }

  const removeStyle = (id: string) => {
    void persist(styles.filter((s) => s.id !== id))
  }

  return (
    <section aria-labelledby="workspace-styles" className="mt-8">
      <h2 id="workspace-styles" className="font-medium text-lg">
        Styles
      </h2>
      <p className="mt-1 text-[var(--muted)] text-sm">
        Named paragraph and character styles available from the editor toolbar.
      </p>

      {/* Existing styles */}
      <ul className="mt-4 flex flex-col gap-2">
        {loaded && styles.length === 0 && (
          <li className="text-[var(--muted)] text-sm">No styles yet.</li>
        )}
        {styles.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2"
          >
            <span className="min-w-0 text-sm">
              <span className="font-medium">{s.name}</span>{' '}
              <span className="text-[var(--muted)] text-xs">
                {s.type}
                {s.basedOn ? ` · based on ${s.basedOn}` : ''}
              </span>
            </span>
            <button
              type="button"
              onClick={() => removeStyle(s.id)}
              className="rounded-md border border-[var(--border)] px-2 py-1 text-[var(--muted)] text-xs hover:bg-[var(--background)]"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {/* Add a style */}
      <fieldset className="mt-4 flex flex-col gap-3 rounded-md border border-[var(--border)] p-4">
        <legend className="px-1 font-medium text-sm">Add a style</legend>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fieldId}-name`} className="font-medium text-sm">
            Name
          </label>
          <input
            id={`${fieldId}-name`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fieldId}-type`} className="font-medium text-sm">
            Type
          </label>
          <select
            id={`${fieldId}-type`}
            value={type}
            onChange={(e) => setType(e.target.value === 'character' ? 'character' : 'paragraph')}
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
          >
            <option value="paragraph">Paragraph</option>
            <option value="character">Character</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fieldId}-font`} className="font-medium text-sm">
            Font family
          </label>
          <input
            id={`${fieldId}-font`}
            type="text"
            value={fontFamily}
            placeholder="e.g. Georgia, serif (blank = inherit)"
            onChange={(e) => setFontFamily(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fieldId}-size`} className="font-medium text-sm">
            Font size
          </label>
          <input
            id={`${fieldId}-size`}
            type="text"
            value={fontSize}
            placeholder="e.g. 14pt"
            onChange={(e) => setFontSize(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id={`${fieldId}-usecolor`}
            type="checkbox"
            checked={useColor}
            onChange={(e) => setUseColor(e.target.checked)}
          />
          <label htmlFor={`${fieldId}-usecolor`} className="font-medium text-sm">
            Color
          </label>
          <input
            id={`${fieldId}-color`}
            type="color"
            aria-label="Style color"
            value={color}
            disabled={!useColor}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-12 rounded-md border border-[var(--border)] bg-[var(--paper)]"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} />{' '}
            Bold
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={italic} onChange={(e) => setItalic(e.target.checked)} />{' '}
            Italic
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={underline}
              onChange={(e) => setUnderline(e.target.checked)}
            />{' '}
            Underline
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fieldId}-basedon`} className="font-medium text-sm">
            Based on
          </label>
          <select
            id={`${fieldId}-basedon`}
            value={basedOn}
            onChange={(e) => setBasedOn(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
          >
            <option value="">(none)</option>
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <button
            type="button"
            onClick={addStyle}
            className="rounded-md bg-[var(--primary)] px-3 py-2 font-medium text-sm text-[var(--on-primary)]"
          >
            Add style
          </button>
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
