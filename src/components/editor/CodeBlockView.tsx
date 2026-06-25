'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { useCallback, useRef, useState } from 'react'

/**
 * CodeBlockView — React NodeView for the `codeBlock` node (C5/C6).
 *
 * Responsibilities:
 *  - Render a <pre> with <code> (NodeViewContent) so existing decoration
 *    plugin token-colours and .parchment-prose pre styles keep working.
 *  - Show a header bar (filename caption + Copy + Collapse/Expand buttons)
 *    on hover/focus or when a filename is set.
 *  - Expose line-number toggle, filename input, and highlight-lines input
 *    directly in the header so all C5 attrs are settable from the UI.
 *  - All header elements are contentEditable={false} so they don't disrupt
 *    ProseMirror editing inside the code block.
 *
 * The decoration plugin (shiki token colours, line-number widgets, line-hl,
 * diff colours) continues to apply inside NodeViewContent — the NodeView just
 * wraps the ProseMirror-managed <code> element.
 */
export function CodeBlockView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const attrs = node.attrs as {
    language?: string | null
    theme?: string
    showLineNumbers?: boolean
    highlightLines?: string
    filename?: string
    collapsed?: boolean
  }

  const showLineNumbers = attrs.showLineNumbers ?? false
  const highlightLines = attrs.highlightLines ?? ''
  const filename = attrs.filename ?? ''
  const collapsed = attrs.collapsed ?? false

  // Copy button transient state.
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(node.textContent).then(() => {
      setCopied(true)
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }, [node.textContent])

  const handleCollapseToggle = useCallback(() => {
    updateAttributes({ collapsed: !collapsed })
  }, [updateAttributes, collapsed])

  const handleLineNumbersToggle = useCallback(() => {
    updateAttributes({ showLineNumbers: !showLineNumbers })
  }, [updateAttributes, showLineNumbers])

  const handleFilenameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateAttributes({ filename: e.target.value })
    },
    [updateAttributes],
  )

  const handleHighlightLinesChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateAttributes({ highlightLines: e.target.value })
    },
    [updateAttributes],
  )

  // P6 (v0.1.7): remove this code block. deleteNode() (from NodeViewProps) is
  // bound to THIS node, so no getPos math is needed; editor undo restores it.
  const handleDelete = useCallback(() => {
    deleteNode()
  }, [deleteNode])

  return (
    <NodeViewWrapper
      as="div"
      className="parchment-cb-wrapper"
      data-collapsed={collapsed || undefined}
    >
      {/* ── Header bar (C5 filename, C6 copy/collapse, C5 controls) ───────── */}
      <div className="parchment-cb-header" contentEditable={false}>
        {/* Filename caption (left side) */}
        <input
          className="parchment-cb-filename-input"
          type="text"
          value={filename}
          onChange={handleFilenameChange}
          placeholder="filename…"
          aria-label="Code block filename"
          onMouseDown={(e) => e.stopPropagation()}
        />

        {/* Highlight-lines input */}
        <input
          className="parchment-cb-hl-input"
          type="text"
          value={highlightLines}
          onChange={handleHighlightLinesChange}
          placeholder="e.g. 1,3-5"
          aria-label="Highlight lines"
          title="Highlight lines (e.g. 1,3-5)"
          onMouseDown={(e) => e.stopPropagation()}
        />

        {/* Right-side action buttons */}
        <div className="parchment-cb-actions">
          {/* Line numbers toggle */}
          <button
            type="button"
            className="parchment-cb-btn"
            aria-label={showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
            aria-pressed={showLineNumbers}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleLineNumbersToggle}
          >
            #
          </button>

          {/* Copy button (C6) */}
          <button
            type="button"
            className="parchment-cb-copy parchment-cb-btn"
            aria-label="Copy code"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleCopy}
          >
            {copied ? '✓' : '⎘'}
          </button>

          {/* Collapse/Expand toggle (C6) */}
          <button
            type="button"
            className="parchment-cb-collapse parchment-cb-btn"
            aria-label={collapsed ? 'Expand code block' : 'Collapse code block'}
            aria-expanded={!collapsed}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleCollapseToggle}
          >
            {collapsed ? '▶' : '▼'}
          </button>

          {/* Delete code block (P6/v0.1.7) — removes this node; undo restores it. */}
          <button
            type="button"
            className="parchment-cb-delete parchment-cb-btn"
            aria-label="Delete code block"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleDelete}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Code content — ProseMirror-managed ───────────────────────────── */}
      {/*
       * The NodeViewContent must render into a <code> element so that:
       *  1. Token-colour decorations from the Shiki plugin apply correctly.
       *  2. .parchment-prose pre > code styles are respected.
       * We wrap it in a <pre> to match what CodeBlock normally renders.
       * collapsed hides the content via CSS (display:none on the pre when
       * [data-collapsed] is set on the wrapper) but keeps it in the DOM
       * so ProseMirror can still manage it.
       */}
      <pre className="parchment-cb-pre">
        {/* NodeViewContent defaults to <div> but ProseMirror attaches the
            editable subtree to whatever DOM element NodeViewContent renders.
            We cast `as` to `'div'` to satisfy TS (the actual "code" element
            passes through at runtime) and style it as a code element. */}
        <NodeViewContent as={'code' as 'div'} />
      </pre>
    </NodeViewWrapper>
  )
}
