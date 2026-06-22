/**
 * G6a — Mermaid diagram embed: block atom node + commands.
 *
 * MERMAID BOUNDARY: mermaid is NEVER imported at module load here. The NodeView
 * (MermaidView.tsx) lazy-imports mermaid inside the browser render. This keeps
 * getSchema(baseExtensions) buildable in the Next.js server runtime (used by the
 * collab seed in Editor.tsx and indirectly by parse/serialize tests) without
 * dragging mermaid (a DOM-coupled lib) into the server bundle.
 *
 * Round-trip: a mermaid node serializes as a standard ```mermaid code fence
 * (not a parchment: fence) — portable and disk-mirror friendly.
 */

import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaid: {
      /**
       * Insert an empty mermaid node. PURE insert — does NOT dispatch the edit
       * event; the slash handler does that after .run() so editor.state reflects
       * the inserted node (the new node's position cannot be resolved inside the
       * chain where view.state is pre-insertion).
       */
      insertMermaid: () => ReturnType
      /** Update the mermaid node at `pos` with a new source string. */
      updateMermaid: (pos: number, source: string) => ReturnType
    }
  }
}

// ── MermaidExtension ────────────────────────────────────────────────────────

export const MermaidExtension = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-mermaid-source') ?? '',
        renderHTML: (attrs) => ({
          'data-mermaid-source': typeof attrs.source === 'string' ? attrs.source : '',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-mermaid]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Keep renderHTML minimal — round-trip goes through serialize/parse, not HTML.
    // The attrs object carries data-mermaid-source from renderHTML above.
    return ['div', { 'data-mermaid': '', ...HTMLAttributes }]
  },

  addNodeView() {
    // Lazy-require MermaidView inside a try/catch so it is never evaluated in
    // the server runtime or in test environments where the @/ alias resolver or
    // JSX transform is unavailable. The schema build, serialize, and parse paths
    // never invoke the NodeView — they only need the schema definition. In the
    // real browser (Next.js client bundle) the alias resolves correctly.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { MermaidView } = require('@/components/editor/MermaidView') as {
        MermaidView: Parameters<typeof ReactNodeViewRenderer>[0]
      }
      return ReactNodeViewRenderer(MermaidView)
    } catch {
      // Server runtime / test env: no NodeView (falls back to renderHTML).
      return undefined as never
    }
  },

  addCommands() {
    return {
      insertMermaid:
        () =>
        ({ commands }) =>
          // Pure insert of an empty mermaid node. Opening the editor popover is
          // the caller's responsibility AFTER .run() dispatches (the slash-menu
          // handler dispatches parchment:edit-mermaid then) — inside a chain,
          // view.state is still pre-insertion, so the new node's position cannot
          // be resolved here.
          commands.insertContent({
            type: this.name,
            attrs: { source: '' },
          }),
      updateMermaid:
        (pos, source) =>
        ({ tr, dispatch, state }) => {
          const target = state.doc.nodeAt(pos)
          // biome-ignore lint/complexity/useOptionalChain: explicit null check needed — nodeAt returns null (not undefined) and the optional chain would change the falsy guard to include undefined
          if (!target || target.type.name !== 'mermaid') return false
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...target.attrs, source })
            dispatch(tr)
          }
          return true
        },
    }
  },
})
