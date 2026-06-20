'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

/** A document candidate returned by /api/docs/search. */
export type WikiDoc = { id: string; title: string }

export interface WikiSuggestionMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export interface WikiSuggestionMenuProps {
  query: string
  command: (doc: WikiDoc) => void
}

/**
 * WikiSuggestionMenu — the `[[` autocomplete popup. Mirrors SlashMenu's
 * forwardRef + useImperativeHandle keyboard contract, but its item source is
 * the async /api/docs/search endpoint (the same source LinkPopover uses for the
 * document picker), so it fetches on every query change.
 *
 * Selecting a doc calls `command(doc)`, which the wiki-suggestion extension
 * turns into a wikiLink node insertion.
 */
export const WikiSuggestionMenu = forwardRef<WikiSuggestionMenuRef, WikiSuggestionMenuProps>(
  function WikiSuggestionMenu({ query, command }, ref) {
    const [docs, setDocs] = useState<WikiDoc[]>([])
    const [activeIndex, setActiveIndex] = useState(0)
    const [loading, setLoading] = useState(false)
    const activeItemRef = useRef<HTMLButtonElement | null>(null)

    // Fetch candidates whenever the query changes. An incrementing token guards
    // against out-of-order responses overwriting a newer query's results.
    useEffect(() => {
      let active = true
      setLoading(true)
      fetch(`/api/docs/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data: unknown) => {
          if (!active) return
          setDocs(Array.isArray(data) ? (data as WikiDoc[]) : [])
          setActiveIndex(0)
        })
        .catch(() => {
          if (active) setDocs([])
        })
        .finally(() => {
          if (active) setLoading(false)
        })
      return () => {
        active = false
      }
    }, [query])

    // Keep the active item scrolled into view as selection moves.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally scroll on activeIndex change
    useEffect(() => {
      activeItemRef.current?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex])

    useImperativeHandle(ref, () => ({
      onKeyDown(event: KeyboardEvent): boolean {
        if (docs.length === 0) return false
        if (event.key === 'ArrowDown') {
          setActiveIndex((i) => (i + 1) % docs.length)
          return true
        }
        if (event.key === 'ArrowUp') {
          setActiveIndex((i) => (i - 1 + docs.length) % docs.length)
          return true
        }
        if (event.key === 'Enter') {
          const doc = docs[activeIndex]
          if (doc) command(doc)
          return true
        }
        return false
      },
    }))

    return (
      <div
        className="parchment-wiki-menu"
        role="listbox"
        aria-label="Link to document"
        // Prevent the editor from losing focus on click.
        onMouseDown={(e) => e.preventDefault()}
      >
        {loading && docs.length === 0 && (
          <div className="parchment-wiki-menu-status" aria-live="polite">
            Searching…
          </div>
        )}
        {!loading && docs.length === 0 && (
          <div className="parchment-wiki-menu-status" aria-live="polite">
            No documents found.
          </div>
        )}
        {docs.map((doc, index) => (
          <button
            key={doc.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={
              index === activeIndex
                ? 'parchment-wiki-menu-item parchment-wiki-menu-item-active'
                : 'parchment-wiki-menu-item'
            }
            ref={index === activeIndex ? activeItemRef : null}
            onClick={() => command(doc)}
            onMouseEnter={() => setActiveIndex(index)}
          >
            {doc.title}
          </button>
        ))}
      </div>
    )
  },
)
