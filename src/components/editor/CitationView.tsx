'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { citationResolveKey } from '@/lib/editor/extensions/citation'

/**
 * G7b: CitationView — inline NodeView for the `citation` node.
 * Reads the resolution plugin state for node.attrs.citeKey and renders the
 * resolved in-text string (e.g. "(Smith, 2020)"). Unknown key → muted "(?)".
 */
export function CitationView({ node, editor }: NodeViewProps) {
  const citeKey = String(node.attrs.citeKey ?? '')
  const page = String(node.attrs.page ?? '')

  // Read the resolution map from plugin state.
  const resolution = citationResolveKey.getState(editor.view.state)
  const resolved = resolution?.get(citeKey)

  // If a page is stored but the resolved inText doesn't include it yet,
  // we use the inText directly from the plugin (which doesn't carry page).
  // The page attr is serialized via markdown; the in-text display here omits it
  // for v0.1 (documented choice — page is preserved in the node, round-trips,
  // but the in-editor display shows the base in-text string).
  const display = resolved ? resolved.inText : citeKey ? `[missing: ${citeKey}]` : '(?)'
  const isMissing = !resolved

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
