import StarterKit from '@tiptap/starter-kit'
import { blockExtensions } from '@/lib/editor/block-extensions'
import { HeadingId } from '@/lib/editor/extensions/heading-id'
import { imageExtensions } from '@/lib/editor/extensions/image'
import { tableExtensions } from '@/lib/editor/extensions/table'
import { TocExtension } from '@/lib/editor/extensions/toc'
import { inlineExtensions } from '@/lib/editor/inline-extensions'

// Base node/mark set. History is disabled because Collaboration (Yjs) provides
// its own undo/redo. Plan B adds more extensions (fonts, tables, footnotes, ...).
export const baseExtensions = [
  StarterKit.configure({
    undoRedo: false,
    // Ensure all six heading levels are available.
    heading: { levels: [1, 2, 3, 4, 5, 6] },
    // B6: StarterKit v3 already bundles Link — configure it here to avoid a
    // duplicate-extension warning. openOnClick: false because the editor is
    // always editable; links open via the LinkPopover.
    link: {
      autolink: true,
      openOnClick: false,
      linkOnPaste: true,
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
    },
  }),
  ...inlineExtensions,
  ...blockExtensions,
  ...tableExtensions,
  imageExtensions,
  // B6: stable heading ids for anchor links, TOC (B7), outline (B11).
  HeadingId,
  // B7: auto table of contents block.
  TocExtension,
]
