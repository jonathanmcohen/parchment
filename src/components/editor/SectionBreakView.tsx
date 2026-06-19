'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { useCallback } from 'react'

/**
 * SectionBreakView — React NodeView for the `sectionBreak` node.
 *
 * Renders a styled divider with a header-text label and an accessible
 * "Edit section" button. Clicking the button dispatches a
 * `parchment:edit-section` CustomEvent (bubbling) with `{ pos }` in detail,
 * mirroring the `parchment:crop-image` pattern used by the image NodeView.
 *
 * Editor.tsx listens for that event, captures `pos`, and opens
 * SectionBreakDialog pre-filled from the node attrs at that position.
 */
export function SectionBreakView({ node, getPos, editor }: NodeViewProps) {
  const headerText = node.attrs.headerText as string
  const label = headerText.trim() ? `§ Section break — ${headerText}` : '§ Section break'

  const handleEdit = useCallback(() => {
    if (typeof getPos !== 'function') return
    const pos = getPos()
    if (pos === undefined) return
    editor.view.dom.dispatchEvent(
      new CustomEvent('parchment:edit-section', {
        bubbles: true,
        detail: { pos },
      }),
    )
  }, [editor, getPos])

  return (
    <NodeViewWrapper
      as="div"
      // Keep data-section-break so PageCanvas can measure this node's offsetTop.
      data-section-break=""
      className="parchment-section-break-node parchment-section-break-nodeview"
      contentEditable={false}
      data-drag-handle
    >
      <span className="parchment-section-break-label" aria-hidden="true">
        {label}
      </span>
      <button
        type="button"
        className="parchment-section-break-edit-btn"
        aria-label="Edit section break"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleEdit}
      >
        Edit section
      </button>
    </NodeViewWrapper>
  )
}
