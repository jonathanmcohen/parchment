import StarterKit from '@tiptap/starter-kit'
import { blockExtensions } from '@/lib/editor/block-extensions'
import { CodeBlockShiki } from '@/lib/editor/extensions/code-block-shiki'
import { FootnoteItem, FootnoteRef, FootnotesBlock } from '@/lib/editor/extensions/footnote'
import { HeadingId } from '@/lib/editor/extensions/heading-id'
import { imageExtensions } from '@/lib/editor/extensions/image'
import { PageBreakExtension, SectionBreakExtension } from '@/lib/editor/extensions/page-primitives'
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
    // C3/C4: Disable StarterKit's built-in codeBlock so our Shiki-powered
    // CodeBlockShiki extension (added below) is the sole codeBlock node.
    // Without this, ProseMirror would warn about a duplicate node type.
    codeBlock: false,
  }),
  ...inlineExtensions,
  ...blockExtensions,
  ...tableExtensions,
  imageExtensions,
  // B6: stable heading ids for anchor links, TOC (B7), outline (B11).
  HeadingId,
  // B7: auto table of contents block.
  TocExtension,
  // B8: footnotes + endnotes.
  FootnoteRef,
  FootnoteItem,
  FootnotesBlock,
  // B13: manual page breaks + section breaks.
  PageBreakExtension,
  SectionBreakExtension,
  // B9: FindReplaceExtension is added in Editor.tsx so it can receive the
  // onOpen callback that controls the React UI panel.
  // B12: SlashMenuExtension is added in Editor.tsx so it can receive the
  // onOpenImage callback that controls the image dialog.
  // C3/C4: Shiki-powered code block (replaces StarterKit's built-in codeBlock).
  CodeBlockShiki,
]
