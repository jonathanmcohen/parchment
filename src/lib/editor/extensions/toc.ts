import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { TocView } from '@/components/editor/TocView'

// Augment the Tiptap Commands interface so `insertToc` is typed on the chain.
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toc: {
      /** Insert a table-of-contents block at the current position. */
      insertToc: () => ReturnType
    }
  }
}

/**
 * TOC node — a block-level, atomic widget that auto-generates a table of
 * contents from the document's headings (collected via collectHeadings).
 *
 * Attributes
 *   showPageNumbers — when true, each TOC entry shows a right-aligned page
 *                     number with CSS leader dots.
 */
export const TocExtension = Node.create({
  name: 'toc',

  group: 'block',

  // atom: true means ProseMirror treats the whole node as a single unit;
  // the NodeView renders everything inside it without ProseMirror managing
  // any inner contentDOM.
  atom: true,

  addAttributes() {
    return {
      showPageNumbers: {
        default: false,
        parseHTML: (element) => element.dataset.showPageNumbers === 'true',
        renderHTML: (attributes) => ({
          'data-show-page-numbers': String(attributes.showPageNumbers),
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-toc]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-toc': '', ...HTMLAttributes }]
  },

  addCommands() {
    return {
      insertToc:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: 'toc', attrs: { showPageNumbers: false } }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(TocView)
  },
})
