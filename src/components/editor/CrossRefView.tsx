'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper, useEditorState } from '@tiptap/react'
import { crossRefNumberingKey } from '@/lib/editor/extensions/cross-ref-numbering'

/**
 * G8b: CrossRefView — inline NodeView for the `crossRef` atom.
 *
 * Resolves `node.attrs.targetId` via `useEditorState` reading the
 * crossRefNumberingKey plugin state (refId → CrossRefTarget map).
 *
 * REACTIVITY LESSON (G7): a crossRef's displayed label depends on a DIFFERENT
 * node moving (figures/tables renumbering), NOT on the crossRef node itself.
 * Reading plugin state once at render goes stale after a sibling target moves.
 * `useEditorState` subscribes to ALL transactions so the label re-resolves
 * whenever any target in the doc changes — the same fix applied to CitationView.
 *
 * Format 'full'   → target.label  (e.g. "Figure 3", "Table 2")
 * Format 'number' → String(target.number) (e.g. "3", "2")
 * Unknown target  → muted "(?)".
 */
export function CrossRefView({ node, editor }: NodeViewProps) {
  const targetId = String(node.attrs.targetId ?? '')
  const format = node.attrs.format === 'number' ? 'number' : 'full'

  // Subscribe to all editor state changes so the label re-resolves when any
  // target in the document is added, removed, or reordered (not just when this
  // crossRef node's own attrs change). This is the G7 lesson — mandatory here.
  const target = useEditorState({
    editor,
    selector: ({ editor: e }) => crossRefNumberingKey.getState(e.view.state)?.get(targetId) ?? null,
  })

  const display = target ? (format === 'number' ? String(target.number) : target.label) : '(?)'

  const isMissing = target === null

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    if (!targetId) return
    editor.view.dom.dispatchEvent(
      new CustomEvent('parchment:goto-ref', {
        bubbles: true,
        detail: { targetId },
      }),
    )
  }

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      data-cross-ref=""
      data-target-id={targetId}
      className={
        isMissing ? 'parchment-cross-ref parchment-cross-ref--missing' : 'parchment-cross-ref'
      }
      title={targetId}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      {display}
    </NodeViewWrapper>
  )
}
