import StarterKit from '@tiptap/starter-kit'
import { blockExtensions } from '@/lib/editor/block-extensions'
import { BibliographyExtension, CitationExtension } from '@/lib/editor/extensions/citation'
import { CodeBlockShiki } from '@/lib/editor/extensions/code-block-shiki'
import { CommentMark } from '@/lib/editor/extensions/comment'
import { CrossRefExtension } from '@/lib/editor/extensions/cross-ref'
import { CrossRefNumberingExtension } from '@/lib/editor/extensions/cross-ref-numbering'
import { DrawingExtension } from '@/lib/editor/extensions/drawing'
import { DrawioExtension } from '@/lib/editor/extensions/drawio'
import { EmbedExtension } from '@/lib/editor/extensions/embed'
import { FootnoteItem, FootnoteRef, FootnotesBlock } from '@/lib/editor/extensions/footnote'
import { HeadingId } from '@/lib/editor/extensions/heading-id'
import { imageExtensions } from '@/lib/editor/extensions/image'
import { EquationRef, MathBlock, MathCommands, MathInline } from '@/lib/editor/extensions/math'
import { MermaidExtension } from '@/lib/editor/extensions/mermaid'
import { PageBreakExtension, SectionBreakExtension } from '@/lib/editor/extensions/page-primitives'
import { PlantumlExtension } from '@/lib/editor/extensions/plantuml'
import { SmartPasteExtension } from '@/lib/editor/extensions/smart-paste'
import { SpeakerNoteExtension } from '@/lib/editor/extensions/speaker-note'
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
  // G6a: Mermaid diagram embed. MermaidExtension does NOT import mermaid at
  // module load (the NodeView lazy-requires MermaidView, which lazy-imports
  // mermaid inside the browser render). getSchema(baseExtensions) builds in
  // the server runtime without ever touching mermaid.
  MermaidExtension,
  // G6b: PlantUML diagram embed. PlantumlExtension does NOT import any
  // rendering code at module load (the NodeView lazy-requires PlantumlView,
  // which uses plantuml.ts at render time). getSchema(baseExtensions) builds
  // in the server runtime without ever touching plantuml-encoder.
  PlantumlExtension,
  // G6c: Drawio diagram embed. DrawioExtension does NOT import any drawio
  // library at module load (the NodeView lazy-requires DrawioView, which only
  // renders the stored SVG; the modal uses an iframe). getSchema(baseExtensions)
  // builds in the server runtime without touching any window-dependent lib.
  DrawioExtension,
  // J2/J3: Embed (read-only calendar + spreadsheet). EmbedExtension imports NO
  // iframe / allowlist / React code at module load — the NodeView (EmbedView)
  // is lazy-required inside addNodeView (same boundary as drawio/mermaid), and
  // it is the ONLY place an iframe is created, only for an allowlisted https
  // provider URL (else a link card). getSchema(baseExtensions) builds in the
  // server runtime. Serializes as a parchment:embed fence.
  EmbedExtension,
  // G7b: Citation node + bibliography block. Neither imports any heavy lib at
  // module load — CitationView / BibliographyView are lazy-required inside
  // addNodeView (same pattern as drawing/mermaid). getSchema(baseExtensions)
  // builds in the server runtime. BibliographyExtension owns the
  // citationResolveKey ProseMirror plugin (DISTINCT PluginKey).
  // CiteSuggestionExtension is added in Editor.tsx (like WikiSuggestionExtension)
  // so its ReactRenderer popup only loads client-side.
  CitationExtension,
  BibliographyExtension,
  // G8a: cross-reference targets — captions + stable refIds + unified numbering.
  // Adds two ProseMirror plugins: the crossRefNumbering state plugin (rebuild
  // ONLY on tr.docChanged — G7 loop lesson) + the appendTransaction that
  // assigns stable refIds to figures/tables/equations missing one.
  CrossRefNumberingExtension,
  // G8b: cross-reference inline node. The NodeView (CrossRefView) is lazy-
  // required inside addNodeView (drawing.ts pattern) — no React/DOM at module
  // load so getSchema(baseExtensions) builds in the server runtime.
  CrossRefExtension,
  // B9: FindReplaceExtension is added in Editor.tsx so it can receive the
  // onOpen callback that controls the React UI panel.
  // B12: SlashMenuExtension is added in Editor.tsx so it can receive the
  // onOpenImage callback that controls the image dialog.
  // C3/C4: Shiki-powered code block (replaces StarterKit's built-in codeBlock).
  CodeBlockShiki,
  // G14: Smart paste — sniff source (Word/GDocs/Notion/web/markdown/plain) and
  // normalize foreign HTML before ProseMirror parses it. Uses transformPastedHTML
  // (DOMParser, browser-only, never called at module load) + handlePaste for
  // markdown-as-plaintext. Internal/plain paste passes through UNCHANGED.
  // Image paste returns false so the B5 editorProps handler still runs.
  SmartPasteExtension,
  // G16: speakerNote block — author-visible presenter notes that are NEVER
  // shown in the public read/share view (render-pm.tsx returns null for them).
  // No DOM/React imported at module load; getSchema(baseExtensions) builds in
  // the Next.js server runtime. Serializes as parchment:speakernote fence.
  SpeakerNoteExtension,
]
