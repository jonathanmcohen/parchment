'use client'

import type { Node as PMNode } from '@tiptap/pm/model'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { useEffect, useState } from 'react'

/**
 * FootnotesView — React NodeView for the `footnotes` block node.
 *
 * Renders a bordered end-of-document section containing numbered footnote
 * definitions. Each item has an editable body (managed by ProseMirror via
 * NodeViewContent) and a back-link (↩) that scrolls the viewport back to the
 * corresponding footnoteRef superscript.
 *
 * Placement note: both 'endnote' and 'footnote' placements render here on
 * screen. The `data-fn-placement` attribute is preserved on the outer element
 * so that print CSS / paged.js can reposition 'footnote' items to page
 * footers (Plan H2 / TODO).
 */
export function FootnotesView({ editor, node }: NodeViewProps) {
  const placement = node.attrs.placement as 'endnote' | 'footnote'

  // Collect ordered ref ids by walking the doc — used to show numbers on the
  // back-links and keep items sorted to match the in-text refs.
  const [refIds, setRefIds] = useState<string[]>(() => collectRefIds(editor))

  useEffect(() => {
    const handler = () => setRefIds(collectRefIds(editor))
    editor.on('update', handler)
    return () => {
      editor.off('update', handler)
    }
  }, [editor])

  // Build a number map: id → display number (1-based, doc order).
  const numberMap = new Map<string, number>()
  refIds.forEach((id, i) => {
    numberMap.set(id, i + 1)
  })

  // Collect item ids in the order they appear inside the footnotes block so
  // we can render the correct number next to each definition.
  const itemIds: string[] = []
  node.forEach((child: PMNode) => {
    if (child.type.name === 'footnoteItem') {
      itemIds.push(String(child.attrs.id))
    }
  })

  return (
    <NodeViewWrapper
      as="section"
      className="parchment-fn-section"
      data-fn-placement={placement}
      aria-label={placement === 'footnote' ? 'Footnotes' : 'Endnotes'}
    >
      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div className="parchment-fn-header" contentEditable={false}>
        <span className="parchment-fn-title">
          {placement === 'footnote' ? 'Footnotes' : 'Endnotes'}
        </span>
      </div>

      {/* ── Footnote items ─────────────────────────────────────────────── */}
      {/*
       * NodeViewContent renders the ProseMirror-managed inner content
       * (the footnoteItem nodes). We wrap it in an <ol> for semantics; the
       * list-style numbers are rendered by CSS (counter-based) and the
       * back-link arrow is positioned absolutely via CSS on the ::before
       * pseudo-element of the wrapper. Because each footnoteItem renders as
       * <li> we get the right DOM structure automatically.
       *
       * The `data-fn-ids` attribute is a space-separated list of ids in
       * document-ref-order, used by JS-driven back-links below.
       */}
      <div className="parchment-fn-items" data-fn-ids={refIds.join(' ')}>
        {/* Overlay back-links (contentEditable=false) — one per item */}
        <div className="parchment-fn-backlinks" contentEditable={false} aria-hidden="true">
          {itemIds.map((id) => {
            const num = numberMap.get(id) ?? '?'
            return (
              <div key={id} className="parchment-fn-backlink-row">
                <span className="parchment-fn-number">{num}.</span>
                <a
                  href={`#fnref-${id}`}
                  id={`fn-def-${id}`}
                  className="parchment-fn-backlink"
                  aria-label={`Back to footnote ${num} in text`}
                  onClick={(e) => e.stopPropagation()}
                >
                  ↩
                </a>
              </div>
            )
          })}
        </div>

        {/* ProseMirror-editable content (the footnoteItem <li> nodes).
         * We use 'div' here because NodeViewContent's `as` generic requires
         * exact element-type inference; the rendered element is styled as a
         * list via CSS. The underlying <li> items are inserted by ProseMirror. */}
        <NodeViewContent className="parchment-fn-list-inner" />
      </div>
    </NodeViewWrapper>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function collectRefIds(editor: { getJSON(): unknown }): string[] {
  const doc = editor.getJSON() as PMJson
  const ids: string[] = []
  walkJson(doc, (n) => {
    if (n.type === 'footnoteRef' && typeof n.attrs?.id === 'string' && n.attrs.id) {
      ids.push(n.attrs.id)
    }
  })
  return ids
}

type PMJson = {
  type: string
  attrs?: Record<string, unknown>
  content?: PMJson[]
}

function walkJson(node: PMJson, fn: (n: PMJson) => void): void {
  fn(node)
  for (const child of node.content ?? []) {
    walkJson(child, fn)
  }
}
