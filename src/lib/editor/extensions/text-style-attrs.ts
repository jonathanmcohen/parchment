import { Extension } from '@tiptap/core'
import '@tiptap/extension-text-style'

// Augment the TextStyleAttributes interface to declare letterSpacing.
declare module '@tiptap/extension-text-style' {
  interface TextStyleAttributes {
    letterSpacing?: string | null
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    letterSpacing: {
      /** Set the letter-spacing on the current selection. */
      setLetterSpacing: (letterSpacing: string) => ReturnType
      /** Unset the letter-spacing on the current selection. */
      unsetLetterSpacing: () => ReturnType
    }
  }
}

/**
 * Extension that adds a `letterSpacing` attribute to the TextStyle mark.
 * FontSize and LineHeight are already provided by TextStyleKit (from
 * @tiptap/extension-text-style); this extension only adds the missing
 * letter-spacing attribute.
 */
export const LetterSpacingExtension = Extension.create({
  name: 'letterSpacing',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (element) => {
              const raw = element.style.letterSpacing
              return raw ? raw : null
            },
            renderHTML: (attributes) => {
              if (!attributes.letterSpacing) return {}
              return { style: `letter-spacing: ${attributes.letterSpacing}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setLetterSpacing:
        (letterSpacing: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { letterSpacing }).run(),
      unsetLetterSpacing:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { letterSpacing: null }).removeEmptyTextStyle().run(),
    }
  },
})
