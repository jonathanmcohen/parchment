import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    firstLineIndent: {
      /** Set a first-line text-indent on the selected paragraph/heading nodes. */
      setFirstLineIndent: (value?: string) => ReturnType
      /** Remove the first-line indent attribute. */
      unsetFirstLineIndent: () => ReturnType
      /** Toggle the first-line indent on/off (using the default 2em). */
      toggleFirstLineIndent: (value?: string) => ReturnType
    }
  }
}

const DEFAULT_INDENT = '2em'

/**
 * Extension that adds a `firstLineIndent` attribute to `paragraph` and
 * `heading` nodes, rendering as `style="text-indent: <value>"`.
 * parseHTML/renderHTML round-trip is preserved.
 */
export const FirstLineIndent = Extension.create({
  name: 'firstLineIndent',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          firstLineIndent: {
            default: null,
            parseHTML: (element) => {
              const indent = element.style.textIndent
              return indent !== '' ? indent : null
            },
            renderHTML: (attributes) => {
              if (!attributes.firstLineIndent) return {}
              return { style: `text-indent: ${attributes.firstLineIndent}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setFirstLineIndent:
        (value = DEFAULT_INDENT) =>
        ({ commands }) =>
          commands.updateAttributes('paragraph', { firstLineIndent: value }),

      unsetFirstLineIndent:
        () =>
        ({ commands }) =>
          commands.updateAttributes('paragraph', { firstLineIndent: null }),

      toggleFirstLineIndent:
        (value = DEFAULT_INDENT) =>
        ({ editor, commands }) => {
          const attrs = editor.getAttributes('paragraph')
          if (attrs.firstLineIndent) {
            return commands.updateAttributes('paragraph', { firstLineIndent: null })
          }
          return commands.updateAttributes('paragraph', { firstLineIndent: value })
        },
    }
  },
})
