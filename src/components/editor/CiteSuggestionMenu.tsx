'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { citeLabel } from '@/lib/citations/format'
import type { CslEntry } from '@/lib/citations/types'

// ── Types ───────────────────────────────────────────────────────────────────

export interface CiteSuggestionMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export interface CiteSuggestionMenuProps {
  items: CslEntry[]
  command: (entry: CslEntry) => void
}

/**
 * CiteSuggestionMenu — the `@`-triggered cite autocomplete popup.
 * Mirrors WikiSuggestionMenu's forwardRef + keyboard contract.
 * Items come from the CiteSourceExtension (already filtered).
 */
export const CiteSuggestionMenu = forwardRef<CiteSuggestionMenuRef, CiteSuggestionMenuProps>(
  function CiteSuggestionMenu({ items, command }, ref) {
    const [activeIndex, setActiveIndex] = useState(0)
    const activeItemRef = useRef<HTMLButtonElement | null>(null)

    // Reset active index when items change.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on items identity change
    useEffect(() => {
      setActiveIndex(0)
    }, [items])

    // Keep the active item scrolled into view.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally scroll on activeIndex change
    useEffect(() => {
      activeItemRef.current?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex])

    useImperativeHandle(ref, () => ({
      onKeyDown(event: KeyboardEvent): boolean {
        if (items.length === 0) return false
        if (event.key === 'ArrowDown') {
          setActiveIndex((i) => (i + 1) % items.length)
          return true
        }
        if (event.key === 'ArrowUp') {
          setActiveIndex((i) => (i - 1 + items.length) % items.length)
          return true
        }
        if (event.key === 'Enter') {
          const entry = items[activeIndex]
          if (entry) command(entry)
          return true
        }
        return false
      },
    }))

    return (
      <div
        className="parchment-cite-menu"
        role="listbox"
        aria-label="Insert citation"
        // Prevent editor from losing focus on click.
        onMouseDown={(e) => e.preventDefault()}
      >
        {items.length === 0 && (
          <div className="parchment-cite-menu-status" aria-live="polite">
            No references — add via Bibliography block.
          </div>
        )}
        {items.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={
              index === activeIndex
                ? 'parchment-cite-menu-item parchment-cite-menu-item-active'
                : 'parchment-cite-menu-item'
            }
            ref={index === activeIndex ? activeItemRef : null}
            onClick={() => command(entry)}
            onMouseEnter={() => setActiveIndex(index)}
          >
            {citeLabel(entry)}
          </button>
        ))}
      </div>
    )
  },
)
