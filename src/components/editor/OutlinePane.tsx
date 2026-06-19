'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HeadingEntry } from '@/lib/editor/headings'
import { collectHeadings } from '@/lib/editor/headings'
import { moveHeadingSection } from '@/lib/editor/outline'

interface Props {
  editor: Editor
}

/**
 * OutlinePane — B11 collapsible left rail showing the document's headings.
 *
 * Features:
 *   - Live-updates via editor 'update' event (same pattern as TocView).
 *   - Click a heading → scrollIntoView + focus the DOM element.
 *   - Pane-level collapse toggle (aria-expanded on the nav).
 *   - Per-heading subtree collapse in the outline view.
 *   - Drag-to-reorder: drags the entire section in the document via
 *     moveHeadingSection.
 */
export function OutlinePane({ editor }: Props) {
  const [entries, setEntries] = useState<HeadingEntry[]>(() => collectHeadings(editor.getJSON()))
  const [paneOpen, setPaneOpen] = useState(true)
  // Set of heading ids whose subtrees are collapsed in the outline
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  // Drag state — track which id is being dragged
  const draggedId = useRef<string | null>(null)

  // Re-collect headings whenever the document changes
  useEffect(() => {
    const handler = () => {
      setEntries(collectHeadings(editor.getJSON()))
    }
    editor.on('update', handler)
    return () => {
      editor.off('update', handler)
    }
  }, [editor])

  // ── Jump to heading ───────────────────────────────────────────────────────

  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Focus the element so keyboard users land in the right place
    el.focus({ preventScroll: true })
  }, [])

  // ── Subtree collapse helpers ──────────────────────────────────────────────

  const toggleSubtree = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Determine which entries to render given collapsed set.
  // An entry is hidden when any ancestor heading id is in `collapsed`.
  const visibleEntries = (() => {
    // Build a stack of open ancestor headings
    const stack: { id: string; level: number }[] = []
    const visible: HeadingEntry[] = []

    for (const entry of entries) {
      // Pop ancestors that are at same or deeper level
      while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= entry.level) {
        stack.pop()
      }

      // Check if any ancestor in the stack is collapsed
      const hidden = stack.some((ancestor) => collapsed.has(ancestor.id))
      if (!hidden) {
        visible.push(entry)
      }

      // Push this heading onto the stack as a potential ancestor
      stack.push({ id: entry.id, level: entry.level })
    }

    return visible
  })()

  // Determine which headings HAVE children (so we show the expander)
  const headingsWithChildren = new Set<string>()
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry === undefined) continue
    const next = entries[i + 1]
    if (next !== undefined && next.level > entry.level) {
      headingsWithChildren.add(entry.id)
    }
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const onDragStart = useCallback((e: React.DragEvent, id: string) => {
    draggedId.current = id
    e.dataTransfer.effectAllowed = 'move'
    // Set ghost text so the drag is legible
    e.dataTransfer.setData('text/plain', id)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault()
      const fromId = draggedId.current
      draggedId.current = null
      if (!fromId || fromId === targetId) return
      moveHeadingSection(editor, fromId, targetId)
    },
    [editor],
  )

  const onDropEnd = useCallback(() => {
    draggedId.current = null
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <aside
      className={`parchment-outline${paneOpen ? '' : ' parchment-outline--collapsed'}`}
      aria-label="Document outline"
    >
      {/* Pane toggle button */}
      <button
        type="button"
        className="parchment-outline-toggle"
        aria-expanded={paneOpen}
        aria-label={paneOpen ? 'Collapse outline' : 'Expand outline'}
        onClick={() => setPaneOpen((v) => !v)}
      >
        <span aria-hidden="true">{paneOpen ? '‹' : '›'}</span>
      </button>

      {paneOpen && (
        <nav aria-label="Document outline">
          <div className="parchment-outline-header">
            <span className="parchment-outline-title">Outline</span>
          </div>

          {visibleEntries.length === 0 ? (
            <p className="parchment-outline-empty">No headings.</p>
          ) : (
            <ul className="parchment-outline-list">
              {visibleEntries.map((entry) => {
                const isCollapsed = collapsed.has(entry.id)
                const hasChildren = headingsWithChildren.has(entry.id)
                const indent = (entry.level - 1) * 12

                return (
                  <li
                    key={entry.id}
                    className="parchment-outline-item"
                    style={{ paddingLeft: `${indent}px` }}
                    draggable
                    onDragStart={(e) => onDragStart(e, entry.id)}
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, entry.id)}
                    onDragEnd={onDropEnd}
                  >
                    {/* Subtree expand/collapse button */}
                    {hasChildren ? (
                      <button
                        type="button"
                        className="parchment-outline-expander"
                        aria-expanded={!isCollapsed}
                        aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
                        onClick={() => toggleSubtree(entry.id)}
                      >
                        <span aria-hidden="true">{isCollapsed ? '▶' : '▼'}</span>
                      </button>
                    ) : (
                      <span className="parchment-outline-expander-spacer" aria-hidden="true" />
                    )}

                    {/* Heading jump link — keyboard-accessible via Enter */}
                    <button
                      type="button"
                      className="parchment-outline-link"
                      onClick={() => jumpTo(entry.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') jumpTo(entry.id)
                      }}
                      title={entry.text}
                    >
                      {entry.text || <em>(empty heading)</em>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </nav>
      )}
    </aside>
  )
}
