'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

/** A Cairn page candidate. `id` is the Cairn pageId, `title` the display label. */
export type CairnPage = { id: string; title: string }

export interface CairnSuggestionMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export interface CairnSuggestionMenuProps {
  query: string
  command: (page: CairnPage) => void
}

/**
 * J1 CairnSuggestionMenu — the `[[cairn://` autocomplete popup. Mirrors
 * WikiSuggestionMenu's forwardRef + useImperativeHandle keyboard contract.
 *
 * OFF-UNLESS-CONFIGURED: items come from `/api/cairn/search` which itself
 * short-circuits to an empty list when CAIRN_BASE_URL is unset (NO external
 * call). So when Cairn is not configured the menu shows no suggestions — but the
 * user can still press Enter to insert whatever pageId they have typed verbatim
 * (manual entry), with no error. When Cairn IS configured the search endpoint
 * proxies Cairn's page-search and the menu lists real pages.
 */
export const CairnSuggestionMenu = forwardRef<CairnSuggestionMenuRef, CairnSuggestionMenuProps>(
  function CairnSuggestionMenu({ query, command }, ref) {
    const [pages, setPages] = useState<CairnPage[]>([])
    const [activeIndex, setActiveIndex] = useState(0)
    const [loading, setLoading] = useState(false)
    const activeItemRef = useRef<HTMLButtonElement | null>(null)

    // Fetch candidates whenever the query changes. An incrementing-active token
    // guards against out-of-order responses overwriting a newer query's results.
    // The endpoint returns [] when Cairn is disabled, so no external call leaks.
    useEffect(() => {
      let active = true
      setLoading(true)
      fetch(`/api/cairn/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data: unknown) => {
          if (!active) return
          setPages(Array.isArray(data) ? (data as CairnPage[]) : [])
          setActiveIndex(0)
        })
        .catch(() => {
          if (active) setPages([])
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

    // Manual entry: when there are no suggestions, Enter inserts the typed query
    // as the pageId (trimmed). The trimmed query is also a valid Cairn page id
    // only after sanitization (insertCairnLink rejects an invalid id), so an
    // empty / unsafe query simply does nothing.
    const insertManual = (): boolean => {
      const id = query.trim()
      if (!id) return false
      command({ id, title: id })
      return true
    }

    useImperativeHandle(ref, () => ({
      onKeyDown(event: KeyboardEvent): boolean {
        if (pages.length === 0) {
          if (event.key === 'Enter') return insertManual()
          return false
        }
        if (event.key === 'ArrowDown') {
          setActiveIndex((i) => (i + 1) % pages.length)
          return true
        }
        if (event.key === 'ArrowUp') {
          setActiveIndex((i) => (i - 1 + pages.length) % pages.length)
          return true
        }
        if (event.key === 'Enter') {
          const page = pages[activeIndex]
          if (page) command(page)
          return true
        }
        return false
      },
    }))

    return (
      <div
        className="parchment-wiki-menu"
        role="listbox"
        aria-label="Link to Cairn page"
        // Prevent the editor from losing focus on click.
        onMouseDown={(e) => e.preventDefault()}
      >
        {loading && pages.length === 0 && (
          <div className="parchment-wiki-menu-status" aria-live="polite">
            Searching Cairn…
          </div>
        )}
        {!loading && pages.length === 0 && (
          <div className="parchment-wiki-menu-status" aria-live="polite">
            {query.trim() ? `Press Enter to link cairn://${query.trim()}` : 'Type a Cairn page id'}
          </div>
        )}
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={
              index === activeIndex
                ? 'parchment-wiki-menu-item parchment-wiki-menu-item-active'
                : 'parchment-wiki-menu-item'
            }
            ref={index === activeIndex ? activeItemRef : null}
            onClick={() => command(page)}
            onMouseEnter={() => setActiveIndex(index)}
          >
            {page.title}
          </button>
        ))}
      </div>
    )
  },
)
