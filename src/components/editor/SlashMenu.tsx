'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  filterSlashItems,
  SLASH_CATEGORIES,
  type SlashCategory,
  type SlashItem,
} from '@/lib/editor/slash-items'

export interface SlashMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export interface SlashMenuProps {
  query: string
  command: (item: SlashItem) => void
}

export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(function SlashMenu(
  { query, command },
  ref,
) {
  const [activeCategory, setActiveCategory] = useState<SlashCategory | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const activeItemRef = useRef<HTMLButtonElement | null>(null)

  // Derive filtered items from query + optional category filter
  const filteredItems: SlashItem[] = (() => {
    const byQuery = filterSlashItems(query)
    if (activeCategory) return byQuery.filter((item) => item.category === activeCategory)
    return byQuery
  })()

  // Reset active index when query or category changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally react to query/category changes
  useEffect(() => {
    setActiveIndex(0)
  }, [query, activeCategory])

  // Scroll active item into view when selection moves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally scroll on activeIndex change
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const selectItem = useCallback(
    (index: number) => {
      const item = filteredItems[index]
      if (item) command(item)
    },
    [filteredItems, command],
  )

  useImperativeHandle(ref, () => ({
    onKeyDown(event: KeyboardEvent): boolean {
      if (event.key === 'ArrowDown') {
        setActiveIndex((i) => (filteredItems.length === 0 ? 0 : (i + 1) % filteredItems.length))
        return true
      }
      if (event.key === 'ArrowUp') {
        setActiveIndex((i) =>
          filteredItems.length === 0 ? 0 : (i - 1 + filteredItems.length) % filteredItems.length,
        )
        return true
      }
      if (event.key === 'Enter') {
        selectItem(activeIndex)
        return true
      }
      return false
    },
  }))

  if (filteredItems.length === 0 && !query) return null

  // Determine which categories are represented in the filtered query results
  // (ignoring the category rail filter so rail items don't disappear)
  const byQuery = filterSlashItems(query)
  const presentCategories = SLASH_CATEGORIES.filter((cat) =>
    byQuery.some((item) => item.category === cat),
  )

  return (
    <div
      className="parchment-slash-menu"
      role="dialog"
      aria-label="Slash command menu"
      // Prevent editor from losing focus on click
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Left category rail */}
      <nav className="parchment-slash-rail" aria-label="Categories">
        <button
          type="button"
          className="parchment-slash-rail-btn"
          aria-pressed={activeCategory === null}
          onClick={() => setActiveCategory(null)}
        >
          All
        </button>
        {presentCategories.map((cat) => (
          <button
            key={cat}
            type="button"
            className="parchment-slash-rail-btn"
            aria-pressed={activeCategory === cat}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </nav>

      {/* Item list */}
      <div className="parchment-slash-list" role="listbox" aria-label="Commands">
        {filteredItems.length === 0 ? (
          <div className="parchment-slash-empty" aria-live="polite">
            No results for &ldquo;{query}&rdquo;
          </div>
        ) : (
          filteredItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={
                index === activeIndex
                  ? 'parchment-slash-item parchment-slash-item-active'
                  : 'parchment-slash-item'
              }
              ref={index === activeIndex ? activeItemRef : null}
              onClick={() => selectItem(index)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="parchment-slash-item-title">{item.title}</span>
              <span className="parchment-slash-item-category">{item.category}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
})
