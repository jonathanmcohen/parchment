import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { LetterSpacingExtension } from '@/lib/editor/extensions/text-style-attrs'

/**
 * Inline formatting extensions for Plan B2.
 * TextStyleKit bundles: TextStyle, Color, FontFamily, FontSize, LineHeight, BackgroundColor.
 * Bold / italic / strike / code / underline are already part of StarterKit — not repeated.
 */
export const inlineExtensions = [
  Subscript,
  Superscript,
  Highlight.configure({ multicolor: true }),
  TextStyleKit.configure({
    backgroundColor: false,
  }),
  LetterSpacingExtension,
]
