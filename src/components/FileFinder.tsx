'use client'

import { useEffect, useRef, useState } from 'react'
import { SHORTCUT_EVENT, type ShortcutEventDetail } from '@/components/shortcuts/GlobalShortcuts'
import { fuzzyFilter } from '@/lib/search/fuzzy'

interface DocTitle {
  id: string
  title: string
}

export function FileFinder() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [titles, setTitles] = useState<DocTitle[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // I2: open/close is driven by the central GlobalShortcuts dispatcher, which
  // owns the (remappable) fuzzy-finder binding and fires parchment:shortcut. The
  // dispatcher preventDefault()s the combo, so the browser print dialog (the
  // old reason this listener called preventDefault) is still suppressed.
  useEffect(() => {
    function handleShortcut(e: Event) {
      const detail = (e as CustomEvent<ShortcutEventDetail>).detail
      if (detail?.action === 'fuzzy-finder') {
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener(SHORTCUT_EVENT, handleShortcut)
    return () => window.removeEventListener(SHORTCUT_EVENT, handleShortcut)
  }, [])

  // Focus input when opened; reset state when closed
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      // Fetch titles on each open (lightweight, good freshness)
      fetch('/api/docs/titles')
        .then((r) => r.json())
        .then((data: DocTitle[]) => {
          setTitles(data)
        })
        .catch(() => {
          // ignore fetch errors — palette must not crash
        })
    } else {
      setQuery('')
      setActiveIdx(0)
    }
  }, [open])

  const results =
    query.trim().length === 0 ? titles.slice(0, 50) : fuzzyFilter(titles, query, (t) => t.title, 50)

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setActiveIdx(0)
  }

  function openDoc(doc: DocTitle) {
    setOpen(false)
    window.location.href = `/d/${doc.id}`
  }

  function handleKeydown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (results.length === 0 ? 0 : Math.min(i + 1, results.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const doc = results[activeIdx]
      if (doc) openDoc(doc)
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
      {/* Backdrop button — clicking it closes the finder */}
      <button
        type="button"
        aria-label="Close file finder"
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
          aria-label="Go to file"
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
              ⌘P
            </span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Go to file…"
              aria-label="File name filter"
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

          {/* Results — use div+button pattern to avoid li/ul with listbox role */}
          <div
            role="listbox"
            aria-label="Documents"
            style={{
              maxHeight: '400px',
              overflowY: 'auto',
              padding: '0.25rem 0',
            }}
          >
            {results.length === 0 && query.trim().length > 0 && (
              <div style={{ padding: '0.75rem 1rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
                No matching files
              </div>
            )}
            {results.length === 0 && query.trim().length === 0 && titles.length === 0 && (
              <div style={{ padding: '0.75rem 1rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
                Loading…
              </div>
            )}
            {results.map((doc, idx) => (
              <button
                key={doc.id}
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                onClick={() => openDoc(doc)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.625rem 1rem',
                  border: 'none',
                  background: idx === activeIdx ? 'var(--background)' : 'transparent',
                  cursor: 'pointer',
                  color: 'var(--foreground)',
                  fontWeight: idx === activeIdx ? 600 : 400,
                  fontSize: '0.9rem',
                }}
              >
                {doc.title || 'Untitled'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
