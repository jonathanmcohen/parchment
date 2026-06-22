/**
 * G8b — Cross-reference inline node: inline atom pointing at a named target.
 *
 * Node shape mirrors equationRef (math.ts) + CitationExtension (citation.ts).
 * The NodeView (CrossRefView) is lazy-required inside addNodeView (drawing.ts
 * pattern) so getSchema(baseExtensions) builds in the server runtime.
 *
 * Click → dispatches `parchment:goto-ref` CustomEvent { targetId } on the PM
 * editor dom. Editor.tsx wires a listener that scrolls the target into view.
 *
 * Markdown form: `[#targetId]` (full format, default) or `[#targetId|number]`
 * (number-only format). Parse/serialize in serialize.ts / parse.ts.
 */

import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import type { RefKind } from '@/lib/editor/cross-ref'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    crossRef: {
      /** Insert an inline cross-reference to `targetId` (kind stored as fallback). */
      insertCrossRef: (targetId: string, kind: RefKind) => ReturnType
    }
  }
}

// ── CrossRefExtension ──────────────────────────────────────────────────────

export const CrossRefExtension = Node.create({
  name: 'crossRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      /** Stable refId of the target node (set by G8a crossRefNumbering plugin). */
      targetId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-target-id') ?? '',
        renderHTML: (attrs) => ({ 'data-target-id': String(attrs.targetId ?? '') }),
      },
      /** Kind cached for display fallback when target is not in the doc. */
      kind: {
        default: 'figure' as RefKind,
        parseHTML: (el) => (el.getAttribute('data-kind') as RefKind) ?? 'figure',
        renderHTML: (attrs) => ({ 'data-kind': String(attrs.kind ?? 'figure') }),
      },
      /**
       * Display format:
       *   'full'   → "Figure 3" (default)
       *   'number' → "3"
       */
      format: {
        default: 'full' as 'full' | 'number',
        parseHTML: (el) => {
          const v = el.getAttribute('data-format')
          return v === 'number' ? 'number' : 'full'
        },
        renderHTML: (attrs) => {
          const f = attrs.format === 'number' ? 'number' : 'full'
          return f !== 'full' ? { 'data-format': f } : {}
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-cross-ref]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    // Static renderHTML is used by the server/test runtime and as the paste/copy
    // representation. Show the targetId as a placeholder; the NodeView renders
    // the live label in the browser.
    const targetId = String(node.attrs.targetId ?? '')
    return [
      'span',
      {
        'data-cross-ref': '',
        class: 'parchment-cross-ref',
        ...HTMLAttributes,
      },
      `[→${targetId}]`,
    ]
  },

  renderText({ node }) {
    return `[→${String(node.attrs.targetId ?? '')}]`
  },

  addNodeView() {
    // Lazy-require CrossRefView so the server runtime / test env never
    // evaluates React JSX (same pattern as drawing.ts, citation.ts).
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { CrossRefView } = require('@/components/editor/CrossRefView') as {
        CrossRefView: Parameters<typeof ReactNodeViewRenderer>[0]
      }
      return ReactNodeViewRenderer(CrossRefView)
    } catch {
      // Server runtime / test env: falls back to renderHTML.
      return undefined as never
    }
  },

  addCommands() {
    return {
      insertCrossRef:
        (targetId, kind) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { targetId, kind, format: 'full' },
          }),
    }
  },
})
