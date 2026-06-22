/**
 * G6b — PlantUML diagram embed: block atom node + commands.
 *
 * PLANTUML BOUNDARY: plantuml-encoder is imported lazily inside the NodeView
 * via plantuml.ts (which uses require()), but the extension itself never imports
 * any rendering code at module load. This keeps getSchema(baseExtensions)
 * buildable in the Next.js server runtime without touching the encoder or DOM.
 *
 * Round-trip: a plantuml node serializes as a standard ```plantuml code fence
 * (not a parchment: fence) — portable and disk-mirror friendly.
 */

import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    plantuml: {
      /**
       * Insert an empty plantuml node. PURE insert — does NOT dispatch the edit
       * event; the slash handler does that after .run() so editor.state reflects
       * the inserted node (the new node's position cannot be resolved inside the
       * chain where view.state is pre-insertion).
       */
      insertPlantuml: () => ReturnType
      /** Update the plantuml node at `pos` with a new source string. */
      updatePlantuml: (pos: number, source: string) => ReturnType
    }
  }
}

// ── PlantumlExtension ───────────────────────────────────────────────────────

export const PlantumlExtension = Node.create({
  name: 'plantuml',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-plantuml-source') ?? '',
        renderHTML: (attrs) => ({
          'data-plantuml-source': typeof attrs.source === 'string' ? attrs.source : '',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-plantuml]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Keep renderHTML minimal — round-trip goes through serialize/parse, not HTML.
    return ['div', { 'data-plantuml': '', ...HTMLAttributes }]
  },

  addNodeView() {
    // Lazy-require PlantumlView inside a try/catch so it is never evaluated in
    // the server runtime or in test environments where the @/ alias resolver or
    // JSX transform is unavailable. The schema build, serialize, and parse paths
    // never invoke the NodeView — they only need the schema definition.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PlantumlView } = require('@/components/editor/PlantumlView') as {
        PlantumlView: Parameters<typeof ReactNodeViewRenderer>[0]
      }
      return ReactNodeViewRenderer(PlantumlView)
    } catch {
      // Server runtime / test env: no NodeView (falls back to renderHTML).
      return undefined as never
    }
  },

  addCommands() {
    return {
      insertPlantuml:
        () =>
        ({ commands }) =>
          // Pure insert of an empty plantuml node. Opening the editor popover is
          // the caller's responsibility AFTER .run() dispatches (the slash-menu
          // handler dispatches parchment:edit-plantuml then) — inside a chain,
          // view.state is still pre-insertion, so the new node's position cannot
          // be resolved here.
          commands.insertContent({
            type: this.name,
            attrs: { source: '' },
          }),
      updatePlantuml:
        (pos, source) =>
        ({ tr, dispatch, state }) => {
          const target = state.doc.nodeAt(pos)
          // biome-ignore lint/complexity/useOptionalChain: explicit null check needed — nodeAt returns null (not undefined) and the optional chain would change the falsy guard to include undefined
          if (!target || target.type.name !== 'plantuml') return false
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...target.attrs, source })
            dispatch(tr)
          }
          return true
        },
    }
  },
})
