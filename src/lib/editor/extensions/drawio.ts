/**
 * G6c — Drawio diagram embed: block atom node + commands.
 *
 * DRAWIO BOUNDARY: no drawio library is imported at module load here. The
 * NodeView (DrawioView.tsx) only renders the stored SVG as an <img> and
 * dispatches a CustomEvent to open the modal. The modal (DrawioModal.tsx)
 * uses an <iframe> to the configured embed URL (postMessage protocol). This
 * keeps getSchema(baseExtensions) buildable in the Next.js server runtime
 * without loading any window-dependent lib.
 *
 * Round-trip: a drawio node serializes as a ```parchment:drawio fence
 * carrying { xml, svg } (mirrors G5 drawing's parchment:drawing fence).
 */

import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    drawio: {
      /** Insert an empty drawio node. */
      insertDrawio: () => ReturnType
      /** Update the drawio node at `pos` with new XML + SVG. */
      updateDrawio: (pos: number, xml: string, svg: string) => ReturnType
    }
  }
}

// ── DrawioExtension ─────────────────────────────────────────────────────────

export const DrawioExtension = Node.create({
  name: 'drawio',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      xml: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-drawio-xml') ?? '',
        renderHTML: (attrs) => ({
          'data-drawio-xml': typeof attrs.xml === 'string' ? attrs.xml : '',
        }),
      },
      svg: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-drawio-svg') ?? '',
        renderHTML: (attrs) => ({
          'data-drawio-svg': typeof attrs.svg === 'string' ? attrs.svg : '',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-drawio]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Keep renderHTML minimal — round-trip goes through serialize/parse, not HTML.
    // The attrs object carries data-drawio-xml and data-drawio-svg from renderHTML above.
    return ['div', { 'data-drawio': '', ...HTMLAttributes }]
  },

  addNodeView() {
    // Lazy-require DrawioView inside a try/catch so it is never evaluated in
    // the server runtime or in test environments where the @/ alias resolver or
    // JSX transform is unavailable. The schema build, serialize, and parse paths
    // never invoke the NodeView — they only need the schema definition. In the
    // real browser (Next.js client bundle) the alias resolves correctly.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DrawioView } = require('@/components/editor/DrawioView') as {
        DrawioView: Parameters<typeof ReactNodeViewRenderer>[0]
      }
      return ReactNodeViewRenderer(DrawioView)
    } catch {
      // Server runtime / test env: no NodeView (falls back to renderHTML).
      return undefined as never
    }
  },

  addCommands() {
    return {
      insertDrawio:
        () =>
        ({ commands }) =>
          // Pure insert of an empty drawio node. Opening the editor modal is the
          // caller's responsibility AFTER .run() dispatches (the slash-menu handler
          // dispatches parchment:edit-drawio then) — inside a chain, view.state is
          // still pre-insertion, so the new node's position cannot be resolved here.
          commands.insertContent({
            type: this.name,
            attrs: { xml: '', svg: '' },
          }),
      updateDrawio:
        (pos, xml, svg) =>
        ({ tr, dispatch, state }) => {
          const target = state.doc.nodeAt(pos)
          // biome-ignore lint/complexity/useOptionalChain: explicit null check needed — nodeAt returns null (not undefined) and the optional chain would change the falsy guard to include undefined
          if (!target || target.type.name !== 'drawio') return false
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...target.attrs, xml, svg })
            dispatch(tr)
          }
          return true
        },
    }
  },
})
