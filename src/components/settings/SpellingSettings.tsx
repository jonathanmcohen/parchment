'use client'

import { useEffect, useId, useState } from 'react'

/**
 * K6 + K7: spelling & grammar settings.
 *   • A toggle for the browser's native spellcheck (persisted to
 *     /api/settings/spellcheck; the editor reads it on next load).
 *   • A custom-dictionary manager (list + add + remove) backed by
 *     /api/dictionary. Words here suppress LanguageTool matches.
 *   • A read-only "Grammar check (LanguageTool)" status reflecting whether the
 *     server has LANGUAGETOOL_URL configured, plus the env-var note for
 *     self-hosters.
 *
 * NOTE on scope (documented for the user): the custom dictionary suppresses
 * LanguageTool grammar matches only — it CANNOT suppress the browser/OS native
 * spellcheck squiggles, which are drawn by the browser and not controllable by
 * the page.
 */
export function SpellingSettings({ grammarEnabled }: { grammarEnabled: boolean }) {
  return (
    <section
      aria-labelledby="workspace-spelling"
      className="mt-12 border-t border-[var(--border)] pt-8"
    >
      <h2 id="workspace-spelling" className="font-medium text-lg">
        Spelling &amp; grammar
      </h2>
      <p className="mt-1 text-[var(--muted)] text-sm">
        Native spellcheck, a custom dictionary, and grammar checking via LanguageTool.
      </p>

      <SpellcheckToggle />
      <GrammarStatusSection grammarEnabled={grammarEnabled} />
      <CustomDictionaryManager />
    </section>
  )
}

function SpellcheckToggle() {
  const id = useId()
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/settings/spellcheck')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { enabled?: boolean }) => {
        if (active && typeof data.enabled === 'boolean') setEnabled(data.enabled)
      })
      .catch(() => {
        /* keep default on failure */
      })
    return () => {
      active = false
    }
  }, [])

  const onChange = async (next: boolean) => {
    setEnabled(next)
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/settings/spellcheck', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setError('Could not save the spellcheck setting. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4">
      <label htmlFor={id} className="flex items-center gap-2.5 text-sm">
        <input
          id={id}
          type="checkbox"
          checked={enabled}
          onChange={(e) => void onChange(e.target.checked)}
        />
        <span className="font-medium">Browser-native spellcheck</span>
        {saving && <span className="text-[var(--muted)] text-xs">Saving…</span>}
      </label>
      <p className="mt-1 text-[var(--muted)] text-xs">
        Uses your browser/OS spell checker to underline misspellings in the editor. Squiggles are
        drawn by the browser, so the custom dictionary below cannot suppress them — it only affects
        grammar (LanguageTool) matches.
      </p>
      {error && (
        <p className="mt-1 text-sm" style={{ color: 'var(--error)' }} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function GrammarStatusSection({ grammarEnabled }: { grammarEnabled: boolean }) {
  return (
    <div className="mt-6">
      <h3 className="font-medium text-sm">Grammar check (LanguageTool)</h3>
      <p className="mt-1 text-sm">
        Status:{' '}
        <span className={grammarEnabled ? 'text-green-700' : 'text-[var(--muted)]'}>
          {grammarEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </p>
      {!grammarEnabled && (
        <p className="mt-1 text-[var(--muted)] text-xs">
          Grammar checking is off by default. To enable it, point the server at a{' '}
          <a
            href="https://github.com/languagetool-org/languagetool"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            LanguageTool
          </a>{' '}
          instance by setting <code className="font-mono">LANGUAGETOOL_URL</code> (and, for
          premium/cloud, the optional <code className="font-mono">LANGUAGETOOL_API_KEY</code> /{' '}
          <code className="font-mono">LANGUAGETOOL_USERNAME</code>). The check is proxied
          server-side, so the key never reaches the browser.
        </p>
      )}
    </div>
  )
}

function CustomDictionaryManager() {
  const id = useId()
  const [words, setWords] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/dictionary')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { words?: string[] }) => {
        if (active && Array.isArray(data.words)) setWords(data.words)
      })
      .catch(() => setError('Could not load the dictionary.'))
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  const add = async () => {
    const word = draft.trim()
    if (word === '') return
    setError(null)
    try {
      const res = await fetch('/api/dictionary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ word }),
      })
      if (!res.ok) throw new Error('add failed')
      const data = (await res.json()) as { words?: string[] }
      if (Array.isArray(data.words)) setWords(data.words)
      setDraft('')
    } catch {
      setError('Could not add the word. Try again.')
    }
  }

  const remove = async (word: string) => {
    setError(null)
    try {
      const res = await fetch('/api/dictionary', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ word }),
      })
      if (!res.ok) throw new Error('remove failed')
      const data = (await res.json()) as { words?: string[] }
      if (Array.isArray(data.words)) setWords(data.words)
    } catch {
      setError('Could not remove the word. Try again.')
    }
  }

  return (
    <div className="mt-6">
      <h3 className="font-medium text-sm">Custom dictionary</h3>
      <p className="mt-1 text-[var(--muted)] text-xs">
        Words here are never flagged by the grammar checker.
      </p>

      {loaded && words.length === 0 ? (
        <div className="mt-3 flex flex-col items-center gap-2 py-8 text-center text-[var(--muted)]">
          <span aria-hidden className="material-symbols-rounded text-[24px]">
            menu_book
          </span>
          <p className="text-sm">No words yet.</p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {words.map((w) => (
            <li
              key={w}
              className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--paper)] px-2.5 py-1 text-sm"
            >
              <span className="font-mono">{w}</span>
              <button
                type="button"
                onClick={() => void remove(w)}
                aria-label={`Remove ${w} from dictionary`}
                className="text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <label htmlFor={id} className="sr-only">
          Add a word to the dictionary
        </label>
        <input
          id={id}
          type="text"
          value={draft}
          spellCheck={false}
          placeholder="Add a word…"
          onChange={(e) => setDraft(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--background)]"
        >
          Add
        </button>
      </form>

      {error && (
        <p className="mt-2 text-sm" style={{ color: 'var(--error)' }} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
