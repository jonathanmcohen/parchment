'use client'

import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { collectHeadings } from '@/lib/editor/headings'

type Props = {
  editor: Editor
  onClose: () => void
}

type DocResult = { id: string; title: string }
type Mode = 'url' | 'heading' | 'doc'

/** Debounce a value by `ms` milliseconds. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/**
 * LinkPopover — modal-style dialog for inserting/editing links.
 *
 * Three modes:
 *  - URL: paste or type any href and apply.
 *  - Heading: pick a heading from the current doc (anchor link).
 *  - Document: fuzzy-search other Parchment docs, set /d/<id> href.
 */
export function LinkPopover({ editor, onClose }: Props) {
  const titleId = useId()
  const hrefId = useId()
  const docQueryId = useId()

  // Reactive: track whether a link mark is currently active.
  const { isLinkActive, currentHref } = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      isLinkActive: ed.isActive('link'),
      currentHref: (ed.getAttributes('link')?.href as string | undefined) ?? '',
    }),
  })

  const [mode, setMode] = useState<Mode>('url')
  const [href, setHref] = useState(currentHref)
  const [docQuery, setDocQuery] = useState('')
  const [docResults, setDocResults] = useState<DocResult[]>([])
  const [docFetching, setDocFetching] = useState(false)
  const [selectedResultIdx, setSelectedResultIdx] = useState(-1)
  const hrefInputRef = useRef<HTMLInputElement>(null)
  const firstResultRef = useRef<HTMLButtonElement>(null)

  const debouncedDocQuery = useDebounced(docQuery, 250)

  // Pre-fill href with existing link on open — intentionally mount-only.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only seed; adding currentHref would reset the user's in-progress edit on every cursor move
  useEffect(() => {
    setHref(currentHref)
  }, [])

  // Focus the href input when switching to URL mode.
  useEffect(() => {
    if (mode === 'url') hrefInputRef.current?.focus()
  }, [mode])

  // Fetch doc search results when query changes.
  useEffect(() => {
    if (mode !== 'doc') return
    setDocFetching(true)
    setSelectedResultIdx(-1)
    fetch(`/api/docs/search?q=${encodeURIComponent(debouncedDocQuery)}`)
      .then((r) => r.json())
      .then((data) => {
        setDocResults(Array.isArray(data) ? (data as DocResult[]) : [])
      })
      .catch(() => setDocResults([]))
      .finally(() => setDocFetching(false))
  }, [debouncedDocQuery, mode])

  const applyLink = useCallback(
    (targetHref: string) => {
      if (!targetHref.trim()) return
      const { state } = editor
      const { selection } = state
      const chain = editor.chain().focus()
      if (selection.empty) {
        chain.extendMarkRange('link').setLink({ href: targetHref }).run()
      } else {
        chain.setLink({ href: targetHref }).run()
      }
      onClose()
    },
    [editor, onClose],
  )

  const removeLink = useCallback(() => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    onClose()
  }, [editor, onClose])

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    applyLink(href.trim())
  }

  const handleHeadingClick = (id: string) => {
    applyLink(`#${id}`)
  }

  const handleDocClick = (doc: DocResult) => {
    const { state } = editor
    const { selection } = state
    const chain = editor.chain().focus()
    const targetHref = `/d/${doc.id}`
    // If nothing is selected, insert the doc title as the link text.
    if (selection.empty) {
      chain
        .insertContent({
          type: 'text',
          text: doc.title,
          marks: [{ type: 'link', attrs: { href: targetHref } }],
        })
        .run()
    } else {
      chain.setLink({ href: targetHref }).run()
    }
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (mode === 'doc' && docResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedResultIdx((i) => Math.min(i + 1, docResults.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedResultIdx((i) => Math.max(i - 1, -1))
      } else if (e.key === 'Enter' && selectedResultIdx >= 0) {
        e.preventDefault()
        const doc = docResults[selectedResultIdx]
        if (doc) handleDocClick(doc)
      }
    }
  }

  const headings = collectHeadings(editor.getJSON())

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss on click is standard modal UX; keyboard close is handled by the inner dialog
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
        className="parchment-dialog"
        onKeyDown={handleKeyDown}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            {isLinkActive ? 'Edit link' : 'Insert link'}
          </h2>
          <button
            type="button"
            aria-label="Close link dialog"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Mode tabs */}
        <div className="parchment-dialog-tabs" role="tablist" aria-label="Link type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'url'}
            className="parchment-dialog-tab"
            onClick={() => setMode('url')}
          >
            URL
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'heading'}
            className="parchment-dialog-tab"
            onClick={() => setMode('heading')}
          >
            Heading
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'doc'}
            className="parchment-dialog-tab"
            onClick={() => setMode('doc')}
          >
            Document
          </button>
        </div>

        {/* ── URL mode ──────────────────────────────────────────────────── */}
        {mode === 'url' && (
          <form onSubmit={handleUrlSubmit} className="parchment-dialog-form">
            <div className="parchment-dialog-field">
              <label htmlFor={hrefId} className="parchment-dialog-label">
                URL or path
              </label>
              <input
                id={hrefId}
                ref={hrefInputRef}
                type="text"
                value={href}
                onChange={(e) => setHref(e.target.value)}
                placeholder="https://example.com"
                className="parchment-dialog-input"
                autoComplete="off"
              />
            </div>
            <div className="parchment-dialog-actions">
              {isLinkActive && (
                <button
                  type="button"
                  className="parchment-dialog-btn-secondary"
                  onClick={removeLink}
                >
                  Remove link
                </button>
              )}
              <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="parchment-dialog-btn-primary"
                disabled={!href.trim()}
              >
                Apply
              </button>
            </div>
          </form>
        )}

        {/* ── Heading mode ─────────────────────────────────────────────── */}
        {mode === 'heading' && (
          <div className="parchment-dialog-form">
            {headings.length === 0 ? (
              <p className="parchment-dialog-empty">No headings found in this document.</p>
            ) : (
              <ul className="parchment-link-list" aria-label="Document headings">
                {headings.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="parchment-link-list-item"
                      style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                      onClick={() => handleHeadingClick(h.id)}
                    >
                      <span className="parchment-link-list-level">H{h.level}</span>
                      <span>{h.text || '(empty heading)'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="parchment-dialog-actions">
              <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Document mode ─────────────────────────────────────────────── */}
        {mode === 'doc' && (
          <div className="parchment-dialog-form">
            <div className="parchment-dialog-field">
              <label htmlFor={docQueryId} className="parchment-dialog-label">
                Search documents
              </label>
              <input
                id={docQueryId}
                type="search"
                value={docQuery}
                onChange={(e) => setDocQuery(e.target.value)}
                placeholder="Type to search…"
                className="parchment-dialog-input"
                autoComplete="off"
                aria-controls="link-doc-results"
              />
            </div>
            <ul
              id="link-doc-results"
              className="parchment-link-list"
              aria-label="Document search results"
              aria-live="polite"
            >
              {docFetching && <li className="parchment-link-list-status">Searching…</li>}
              {!docFetching && docResults.length === 0 && (
                <li className="parchment-link-list-status">No documents found.</li>
              )}
              {!docFetching &&
                docResults.map((doc, idx) => (
                  <li key={doc.id}>
                    <button
                      ref={idx === 0 ? firstResultRef : undefined}
                      type="button"
                      className="parchment-link-list-item"
                      aria-current={selectedResultIdx === idx ? 'true' : undefined}
                      onClick={() => handleDocClick(doc)}
                    >
                      {doc.title}
                    </button>
                  </li>
                ))}
            </ul>
            <div className="parchment-dialog-actions">
              <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
