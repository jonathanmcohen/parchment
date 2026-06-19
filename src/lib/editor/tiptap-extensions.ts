import StarterKit from '@tiptap/starter-kit'
import { blockExtensions } from '@/lib/editor/block-extensions'
import { inlineExtensions } from '@/lib/editor/inline-extensions'

// Base node/mark set. History is disabled because Collaboration (Yjs) provides
// its own undo/redo. Plan B adds more extensions (fonts, tables, footnotes, ...).
export const baseExtensions = [
  StarterKit.configure({
    undoRedo: false,
    // Ensure all six heading levels are available.
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
  ...inlineExtensions,
  ...blockExtensions,
]
