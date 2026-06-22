/**
 * G5 — Excalidraw drawing embed: block atom node + commands.
 *
 * EXCALIDRAW BOUNDARY: @excalidraw/excalidraw is NEVER imported at module load
 * here. The NodeView (DrawingView.tsx) only renders the stored SVG as an <img>
 * and dispatches a CustomEvent to open the modal. The modal (DrawingModal.tsx)
 * dynamic-imports Excalidraw with ssr:false. This keeps getSchema(baseExtensions)
 * buildable in the Next.js server runtime without loading a window-dependent lib.
 */

import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    drawing: {
      /** Insert an empty drawing node and immediately open the drawing modal. */
      insertDrawing: () => ReturnType
      /** Update the drawing node at `pos` with a new scene + SVG snapshot. */
      updateDrawing: (pos: number, scene: object, svg: string) => ReturnType
    }
  }
}

// ── DrawingExtension ────────────────────────────────────────────────────────

export const DrawingExtension = Node.create({
  name: 'drawing',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      scene: {
        default: null,
        // Parse from data attribute: stored as JSON string in HTML.
        parseHTML: (el) => {
          const raw = el.getAttribute('data-drawing-scene')
          if (!raw) return null
          try {
            return JSON.parse(raw) as object
          } catch {
            return null
          }
        },
        renderHTML: (attrs) => {
          if (!attrs.scene) return {}
          return { 'data-drawing-scene': JSON.stringify(attrs.scene) }
        },
      },
      svg: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-drawing-svg') ?? '',
        renderHTML: (attrs) => ({
          'data-drawing-svg': typeof attrs.svg === 'string' ? attrs.svg : '',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-drawing]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Keep renderHTML minimal — round-trip goes through serialize/parse, not HTML.
    // The attrs object carries data-drawing-scene and data-drawing-svg from renderHTML above.
    return ['div', { 'data-drawing': '', ...HTMLAttributes }]
  },

  addNodeView() {
    // Lazy-require DrawingView inside a try/catch so it is never evaluated in
    // the server runtime or in test environments where the @/ alias resolver or
    // JSX transform is unavailable. The schema build, serialize, and parse paths
    // never invoke the NodeView — they only need the schema definition. In the
    // real browser (Next.js client bundle) the alias resolves correctly.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DrawingView } = require('@/components/editor/DrawingView') as {
        DrawingView: Parameters<typeof ReactNodeViewRenderer>[0]
      }
      return ReactNodeViewRenderer(DrawingView)
    } catch {
      // Server runtime / test env: no NodeView (falls back to renderHTML).
      return undefined as never
    }
  },

  addCommands() {
    return {
      insertDrawing:
        () =>
        // biome-ignore lint/correctness/noUnusedFunctionParameters: dispatch is part of the Tiptap command signature; the command writes via view.dom.dispatchEvent (a DOM event, not a ProseMirror dispatch)
        ({ commands, dispatch, view }) => {
          // Insert empty drawing node at the current selection.
          const inserted = commands.insertContent({
            type: this.name,
            attrs: { scene: null, svg: '' },
          })
          if (!inserted) return false
          // After insertContent() the view's state has already been updated —
          // use view.state (post-insertion) NOT the stale `state` closure variable
          // which reflects the pre-insertion EditorState. Walk backward from the
          // post-insertion cursor to find the newly inserted drawing node.
          if (view) {
            const postState = view.state
            // The cursor is placed just after the inserted atom node. Walk
            // backward from the current selection to find the drawing node.
            let drawingPos: number | null = null
            const cursorPos = postState.selection.from
            postState.doc.nodesBetween(0, cursorPos, (node, pos) => {
              if (node.type.name === 'drawing') {
                drawingPos = pos
              }
              return true
            })
            if (drawingPos !== null) {
              view.dom.dispatchEvent(
                new CustomEvent('parchment:edit-drawing', {
                  bubbles: true,
                  detail: { pos: drawingPos, scene: null },
                }),
              )
            }
          }
          return true
        },
      updateDrawing:
        (pos, scene, svg) =>
        ({ tr, dispatch, state }) => {
          const target = state.doc.nodeAt(pos)
          // biome-ignore lint/complexity/useOptionalChain: explicit null check needed — nodeAt returns null (not undefined) and the optional chain would change the falsy guard to include undefined
          if (!target || target.type.name !== 'drawing') return false
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...target.attrs, scene, svg })
            dispatch(tr)
          }
          return true
        },
    }
  },
})
