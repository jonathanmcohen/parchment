'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  registerShortcutAction,
  SHORTCUT_EVENT,
  type ShortcutEventDetail,
} from '@/components/shortcuts/GlobalShortcuts'
import { parseQuery } from '@/lib/search/operators'

// J6-3: the operators the palette advertises in its hint row. Mirrors the
// recognized set in @/lib/search/operators (parseQuery).
const OPERATOR_HINTS = ['tag:', 'folder:', 'is:starred', 'title:', 'before:', 'after:'] as const

interface SearchResult {
  id: string
  title: string
  preview: string
  updatedAt: string
}

interface SearchResponse {
  mode: string
  semanticEnabled: boolean
  results: SearchResult[]
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'keyword' | 'semantic'>('keyword')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [semanticEnabled, setSemanticEnabled] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  // J6-3: reflect the structured operators the user has typed as chips so they
  // can see exactly how their query is being filtered.
  const parsedChips = useMemo(() => {
    const f = parseQuery(query).filters
    const chips: { key: string; label: string }[] = []
    if (f.tagName) chips.push({ key: 'tag', label: `tag: ${f.tagName}` })
    if (f.excludeTagName) chips.push({ key: 'extag', label: `−tag: ${f.excludeTagName}` })
    if (f.folderName) chips.push({ key: 'folder', label: `folder: ${f.folderName}` })
    if (f.starred) chips.push({ key: 'starred', label: 'starred' })
    if (f.titleContains) chips.push({ key: 'title', label: `title: ${f.titleContains}` })
    if (f.after) chips.push({ key: 'after', label: `after: ${f.after}` })
    if (f.before) chips.push({ key: 'before', label: `before: ${f.before}` })
    return chips
  }, [query])

  // I2: open/close is driven by the central GlobalShortcuts dispatcher, which
  // owns the (remappable) command-palette binding and fires parchment:shortcut.
  // This replaces the hard-coded Cmd-K listener so a user remap takes effect.
  useEffect(() => {
    function handleShortcut(e: Event) {
      const detail = (e as CustomEvent<ShortcutEventDetail>).detail
      if (detail?.action === 'command-palette') {
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener(SHORTCUT_EVENT, handleShortcut)
    // Finding C: tell the dispatcher this action has a live handler so it
    // intercepts (and suppresses the browser default for) the combo here.
    const unregister = registerShortcutAction('command-palette')
    return () => {
      window.removeEventListener(SHORTCUT_EVENT, handleShortcut)
      unregister()
    }
  }, [])

  // Focus input when opened; reset state when closed
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    } else {
      setQuery('')
      setResults([])
      setActiveIdx(0)
    }
  }, [open])

  // Probe semanticEnabled on first open
  useEffect(() => {
    if (!open) return
    fetch('/api/search?q=')
      .then((r) => r.json())
      .then((data: SearchResponse) => {
        setSemanticEnabled(data.semanticEnabled ?? false)
      })
      .catch(() => {
        // ignore
      })
  }, [open])

  const doSearch = useCallback((q: string, m: 'keyword' | 'semantic') => {
    if (!q.trim()) {
      setResults([])
      return
    }
    fetch(`/api/search?q=${encodeURIComponent(q)}&mode=${m}`)
      .then((r) => r.json())
      .then((data: SearchResponse) => {
        setResults(data.results ?? [])
        setSemanticEnabled(data.semanticEnabled ?? false)
        setActiveIdx(0)
      })
      .catch(() => {
        // ignore fetch errors — palette must not crash
      })
  }, [])

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(q, mode)
    }, 200)
  }

  function handleModeChange(m: 'keyword' | 'semantic') {
    setMode(m)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    doSearch(query, m)
  }

  function openResult(result: SearchResult) {
    setOpen(false)
    router.push(`/d/${result.id}`)
  }

  function handleKeydown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const result = results[activeIdx]
      if (result) openResult(result)
    }
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
      }}
    >
      {/* Backdrop button — clicking it closes the palette */}
      <button
        type="button"
        aria-label="Close search"
        onClick={() => setOpen(false)}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          border: 'none',
          cursor: 'default',
        }}
      />
      <div style={{ position: 'relative', width: '100%', maxWidth: '560px' }}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          style={{
            background: 'var(--paper)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Search input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              gap: '0.5rem',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: '1rem' }}>
              ⌘K
            </span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search documents…"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleKeydown}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--foreground)',
                fontSize: '1rem',
              }}
            />
          </div>

          {/* J6-3: parsed-operator chips + an available-operators hint. The chips
              show how the typed query is being filtered; the hint advertises the
              operator vocabulary when no operators are active yet. */}
          {parsedChips.length > 0 ? (
            <section
              aria-label="Active filters"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.35rem',
                padding: '0.5rem 1rem',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {parsedChips.map((chip) => (
                <span
                  key={chip.key}
                  data-operator-chip={chip.key}
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.1rem 0.5rem',
                    borderRadius: '999px',
                    background: 'var(--primary-surface, var(--background))',
                    color: 'var(--primary-surface-text, var(--foreground))',
                    border: '1px solid var(--border)',
                  }}
                >
                  {chip.label}
                </span>
              ))}
            </section>
          ) : (
            query.trim() === '' && (
              <section
                aria-label="Available search operators"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.35rem',
                  padding: '0.5rem 1rem',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--muted)',
                  fontSize: '0.72rem',
                }}
              >
                <span>Filters:</span>
                {OPERATOR_HINTS.map((op) => (
                  <code
                    key={op}
                    data-operator-hint={op}
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      background: 'var(--background)',
                      padding: '0 0.3rem',
                      borderRadius: '0.2rem',
                    }}
                  >
                    {op}
                  </code>
                ))}
              </section>
            )
          )}

          {/* Mode toggle */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              onClick={() => handleModeChange('keyword')}
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '0.25rem',
                border: '1px solid var(--border)',
                background: mode === 'keyword' ? 'var(--foreground)' : 'transparent',
                color: mode === 'keyword' ? 'var(--paper)' : 'var(--foreground)',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Keyword
            </button>
            <button
              type="button"
              onClick={() => semanticEnabled && handleModeChange('semantic')}
              disabled={!semanticEnabled}
              title={
                semanticEnabled
                  ? undefined
                  : 'Semantic search requires EMBEDDINGS_URL to be configured'
              }
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '0.25rem',
                border: '1px solid var(--border)',
                background:
                  mode === 'semantic' && semanticEnabled ? 'var(--foreground)' : 'transparent',
                color: semanticEnabled
                  ? mode === 'semantic'
                    ? 'var(--paper)'
                    : 'var(--foreground)'
                  : 'var(--muted)',
                cursor: semanticEnabled ? 'pointer' : 'not-allowed',
                fontSize: '0.875rem',
              }}
            >
              Semantic{!semanticEnabled ? ' (not configured)' : ''}
            </button>
          </div>

          {/* Results */}
          <div
            role="listbox"
            aria-label="Search results"
            style={{
              maxHeight: '400px',
              overflowY: 'auto',
              padding: '0.25rem 0',
            }}
          >
            {results.length === 0 && query.trim() && (
              <div style={{ padding: '0.75rem 1rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
                No results
              </div>
            )}
            {results.map((result, idx) => (
              <button
                key={result.id}
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                onClick={() => openResult(result)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.625rem 1rem',
                  border: 'none',
                  background: idx === activeIdx ? 'var(--background)' : 'transparent',
                  cursor: 'pointer',
                  color: 'var(--foreground)',
                }}
              >
                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                  {result.title || 'Untitled'}
                </div>
                {result.preview && (
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--muted)',
                      marginTop: '0.125rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {result.preview}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
