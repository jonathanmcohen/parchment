'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper, useEditorState } from '@tiptap/react'
import { citationResolveKey } from '@/lib/editor/extensions/citation'

/**
 * G7b: CitationView — inline NodeView for the `citation` node.
 * Reads the resolution plugin state for node.attrs.citeKey and renders the
 * resolved in-text string (e.g. "(Smith, 2020)"). Unknown key → muted "(?)".
 */
export function CitationView({ node, editor }: NodeViewProps) {
  const citeKey = String(node.attrs.citeKey ?? '')
  const page = String(node.attrs.page ?? '')

  // Subscribe to editor transactions via useEditorState so the in-text string
  // RE-RESOLVES when the bibliography's refs/style change. A NodeView's own
  // props only change when its own node changes — but a citation's resolved text
  // depends on a DIFFERENT node (the bibliography), so without this subscription
  // the citation would render the stale style after a style switch.
  const resolvedInText = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      citationResolveKey.getState(e.view.state)?.get(citeKey)?.inText ?? null,
  })

  // The page attr is preserved in the node + round-trips via markdown; the
  // in-editor display shows the base in-text string for v0.1 (documented choice).
  const display = resolvedInText ?? (citeKey ? `[missing: ${citeKey}]` : '(?)')
  const isMissing = resolvedInText === null

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      data-citation=""
      data-cite-key={citeKey}
      className={
        isMissing ? 'parchment-citation parchment-citation--missing' : 'parchment-citation'
      }
      title={page ? `p. ${page}` : undefined}
    >
      {display}
    </NodeViewWrapper>
  )
}
