'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { useCallback, useEffect, useState } from 'react'
import type { HeadingEntry } from '@/lib/editor/headings'
import { collectHeadings } from '@/lib/editor/headings'
import { headingPage } from '@/lib/editor/toc-pages'

// Default page height for Letter size at 96 dpi (matches paginate.ts).
const DEFAULT_PAGE_HEIGHT_PX = 1056

/**
 * Resolve the DOM offsetTop for a heading by its id.
 * Returns undefined when the DOM element is not available (SSR / initial render).
 */
function resolveOffsetTop(id: string): number | undefined {
  if (typeof document === 'undefined') return undefined
  const el = document.getElementById(id)
  if (!el) return undefined
  return el.offsetTop
}

/**
 * TocView — React NodeView for the `toc` node.
 *
 * Renders a navigational table of contents from the document's headings.
 * Keeps itself up to date via:
 *   - An editor `update` listener that refreshes the heading list whenever the
 *     document changes.
 *   - A manual Refresh button for cases where the list appears stale.
 *
 * When showPageNumbers is on, each entry shows a right-aligned page number
 * derived from the heading element's DOM offsetTop divided by the page height.
 * When the DOM offset isn't available (SSR / initial), the entry is rendered
 * gracefully without a page number.
 */
export function TocView({ editor, node, updateAttributes }: NodeViewProps) {
  const showPageNumbers = node.attrs.showPageNumbers as boolean

  const [entries, setEntries] = useState<HeadingEntry[]>(() => collectHeadings(editor.getJSON()))

  const refresh = useCallback(() => {
    setEntries(collectHeadings(editor.getJSON()))
  }, [editor])

  // Re-collect headings whenever the document changes.
  useEffect(() => {
    const handler = () => {
      setEntries(collectHeadings(editor.getJSON()))
    }
    editor.on('update', handler)
    return () => {
      editor.off('update', handler)
    }
  }, [editor])

  const togglePageNumbers = useCallback(() => {
    updateAttributes({ showPageNumbers: !showPageNumbers })
  }, [updateAttributes, showPageNumbers])

  return (
    // NodeViewWrapper renders the outer element that ProseMirror manages.
    // contentEditable=false makes the whole widget non-editable.
    <NodeViewWrapper as="div" className="parchment-toc" contentEditable={false} data-drag-handle>
      <nav aria-label="Table of contents">
        {/* ── Header bar ───────────────────────────────────────── */}
        <div className="parchment-toc-header">
          <span className="parchment-toc-title">Contents</span>
          <div className="parchment-toc-controls">
            <button
              type="button"
              className="parchment-toc-btn"
              aria-label="Refresh table of contents"
              onMouseDown={(e) => e.preventDefault()}
              onClick={refresh}
            >
              ↻ Refresh
            </button>
            <button
              type="button"
              className="parchment-toc-btn"
              aria-label="Toggle page numbers"
              aria-pressed={showPageNumbers}
              onMouseDown={(e) => e.preventDefault()}
              onClick={togglePageNumbers}
            >
              Page #
            </button>
          </div>
        </div>

        {/* ── Entry list ───────────────────────────────────────── */}
        {entries.length === 0 ? (
          <p className="parchment-toc-empty">No headings found.</p>
        ) : (
          <ol className="parchment-toc-list">
            {entries.map((entry, idx) => {
              const offsetTop = resolveOffsetTop(entry.id)
              const pageNum =
                showPageNumbers && offsetTop !== undefined
                  ? headingPage(offsetTop, DEFAULT_PAGE_HEIGHT_PX)
                  : undefined

              // Stable key: id is unique per heading (de-duplicated by collectHeadings).
              // Append idx as a tiebreaker for the rare case of an empty heading text
              // that gets the same fallback slug 'heading'.
              const key = `${entry.id}-${idx}`

              return (
                <li
                  key={key}
                  className="parchment-toc-entry"
                  style={{ paddingLeft: `${(entry.level - 1) * 1.25}em` }}
                >
                  {showPageNumbers ? (
                    <span className="parchment-toc-row">
                      <a
                        href={`#${entry.id}`}
                        className="parchment-toc-link"
                        onClick={(e) => {
                          // Prevent ProseMirror from capturing the click
                          e.stopPropagation()
                        }}
                      >
                        {entry.text}
                      </a>
                      <span className="parchment-toc-dots" aria-hidden="true" />
                      {pageNum !== undefined ? (
                        <span className="parchment-toc-page">{pageNum}</span>
                      ) : (
                        <span
                          className="parchment-toc-page parchment-toc-page--unknown"
                          title="page unknown"
                        >
                          –
                        </span>
                      )}
                    </span>
                  ) : (
                    <a
                      href={`#${entry.id}`}
                      className="parchment-toc-link"
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      {entry.text}
                    </a>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </nav>
    </NodeViewWrapper>
  )
}
