import StarterKit from '@tiptap/starter-kit'
import { blockExtensions } from '@/lib/editor/block-extensions'
import { CodeBlockShiki } from '@/lib/editor/extensions/code-block-shiki'
import { CommentMark } from '@/lib/editor/extensions/comment'
import { DrawingExtension } from '@/lib/editor/extensions/drawing'
import { FootnoteItem, FootnoteRef, FootnotesBlock } from '@/lib/editor/extensions/footnote'
import { HeadingId } from '@/lib/editor/extensions/heading-id'
import { imageExtensions } from '@/lib/editor/extensions/image'
import { EquationRef, MathBlock, MathCommands, MathInline } from '@/lib/editor/extensions/math'
import { PageBreakExtension, SectionBreakExtension } from '@/lib/editor/extensions/page-primitives'
import { Suggesting } from '@/lib/editor/extensions/suggesting'
import { tableExtensions } from '@/lib/editor/extensions/table'
import { TocExtension } from '@/lib/editor/extensions/toc'
import { WikiLink } from '@/lib/editor/extensions/wiki-link'
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
  // D1: comment thread anchoring mark.
  CommentMark,
  // D2: suggesting mode — tracked insertions/deletions.
  Suggesting,
  // F6: [[wiki]] link inline atom node (renders + serializes as [[Label]]).
  // The `[[` autocomplete (WikiSuggestionExtension) is added in Editor.tsx so
  // it can drive the React popup, matching the SlashMenu wiring below.
  WikiLink,
  // G4: KaTeX equations. The math NODE definitions do NOT import katex at
  // module load (katex is lazy-imported inside the client NodeView render), so
  // getSchema(baseExtensions) still builds in the server runtime. MathBlock
  // owns the numbering ProseMirror plugin; MathCommands is an Extension (no
  // schema node) hosting the shared updateMath command.
  MathInline,
  MathBlock,
  EquationRef,
  MathCommands,
  // G5: Excalidraw drawing embed. DrawingExtension does NOT import excalidraw
  // at module load (the NodeView lazy-requires DrawingView, which in turn uses
  // next/dynamic ssr:false for Excalidraw). getSchema(baseExtensions) builds
  // in the server runtime without ever touching excalidraw.
  DrawingExtension,
  // B9: FindReplaceExtension is added in Editor.tsx so it can receive the
  // onOpen callback that controls the React UI panel.
  // B12: SlashMenuExtension is added in Editor.tsx so it can receive the
  // onOpenImage callback that controls the image dialog.
  // C3/C4: Shiki-powered code block (replaces StarterKit's built-in codeBlock).
  CodeBlockShiki,
]
