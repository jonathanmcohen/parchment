import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /** Apply the comment mark over the current selection, tagging it with the threadId. */
      setCommentThread: (threadId: string) => ReturnType
      /** Remove the comment mark with the given threadId from the current selection. */
      unsetCommentThread: (threadId: string) => ReturnType
    }
  }
}

/**
 * CommentMark — D1 anchored comment highlight.
 *
 * Renders `<span class="parchment-comment" data-thread-id="…">` over the
 * marked range. Clicking a span dispatches `parchment:focus-comment` so
 * the sidebar can scroll/focus that thread.
 */
export const CommentMark = Mark.create({
  name: 'comment',

  // Allow multiple comment marks to overlap (different threadIds)
  spanning: false,
  inclusive: false,

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-thread-id'),
        renderHTML: (attributes) => {
          const threadId = attributes.threadId as string | null
          return threadId ? { 'data-thread-id': threadId } : {}
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-thread-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'parchment-comment' }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setCommentThread:
        (threadId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { threadId }),

      unsetCommentThread:
        (threadId: string) =>
        ({ tr, state, dispatch }) => {
          // Remove only marks whose threadId matches
          const { from, to } = state.selection
          state.doc.nodesBetween(from, to, (node, pos) => {
            node.marks.forEach((mark) => {
              if (mark.type.name === 'comment' && mark.attrs.threadId === threadId) {
                if (dispatch) {
                  const start = Math.max(from, pos)
                  const end = Math.min(to, pos + node.nodeSize)
                  tr.removeMark(start, end, mark.type)
                }
              }
            })
          })
          if (dispatch) dispatch(tr)
          return true
        },
    }
  },

  // Clicking a comment span focuses that thread in the sidebar via a
  // ProseMirror plugin (addEventListeners is not part of the Tiptap 3 Mark API).
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('commentClick'),
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement | null
            const span = target?.closest<HTMLElement>('span[data-thread-id]')
            const threadId = span?.getAttribute('data-thread-id')
            if (!threadId) return false
            editor.view.dom.dispatchEvent(
              new CustomEvent('parchment:focus-comment', {
                detail: { threadId },
                bubbles: true,
              }),
            )
            return false // don't consume — let selection proceed
          },
        },
      }),
    ]
  },
})
