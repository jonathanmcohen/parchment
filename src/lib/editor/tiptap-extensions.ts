import StarterKit from '@tiptap/starter-kit'

// Base node/mark set. History is disabled because Collaboration (Yjs) provides
// its own undo/redo. Plan B adds more extensions (fonts, tables, footnotes, ...).
export const baseExtensions = [StarterKit.configure({ undoRedo: false })]
