'use client'

import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { Menu } from '@/components/editor/menus/Menu'
import { StylesMenu } from '@/components/editor/StylesMenu'
import { TableControls } from '@/components/editor/TableControls'
import { VoiceButton } from '@/components/editor/VoiceButton'
import { detectLanguage, getActiveCodeBlockText } from '@/lib/editor/shiki/auto-detect'
import { TOP_LANGUAGES } from '@/lib/editor/shiki/languages'
import { partitionControls } from '@/lib/editor/toolbar-overflow'
import { stepFontSize } from '@/lib/editor/toolbar-size'

// S3-3: px reserved for the `⋯` trigger (a 32px icon button + 2px flex gap)
// when the secondary group overflows. Fed to `partitionControls`.
const OVERFLOW_BTN_WIDTH = 34

type Props = {
  editor: Editor
  onInsertImage: (prefillSrc?: string) => void
  onOpenLink: () => void
  onCropImage: () => void
  onOpenPageSetup: () => void
  onOpenWatermark: () => void
  onOpenCustomCss: () => void
  onToggleComments: () => void
  commentsSidebarOpen: boolean
  /**
   * F3: "Add comment" — anchors a comment to the current selection by REUSING
   * the D1 create flow. The handler opens the comments sidebar and bumps a
   * composer-open intent passed to CommentsSidebar as a prop, which opens its
   * composer on the selection once mounted. No parallel comment system; the
   * toolbar only triggers the existing path.
   */
  onAddComment: () => void
  onToggleVersionHistory: () => void
  versionHistoryOpen: boolean
  onToggleSuggestions: () => void
  suggestionsOpen: boolean
  onToggleBacklinks: () => void
  backlinksOpen: boolean
  /** K7: grammar-check panel toggle — only rendered when grammar is enabled. */
  onToggleGrammar?: () => void
  grammarOpen?: boolean
  grammarEnabled?: boolean
  onOpenShare: () => void
  onToggleReading: () => void
  readingOpen: boolean
  onTogglePresenter: () => void
  presenterOpen: boolean
  /** H2: open the print / PDF view. */
  onExportPdf: () => void
  /** I2 Part 3: enter Vim markdown source mode. */
  onToggleSourceMode: () => void
  sourceModeOpen: boolean
  /** I2 Part 3: disabled while another peer is actively collaborating. */
  sourceModeDisabled: boolean
}

// F3: the Google-Docs font list, in Docs order. Arial is the default — when no
// fontFamily mark is set the <select> shows Arial selected (see DEFAULT_FONT_VALUE)
// and selecting it applies `Arial, sans-serif`. Each entry's CSS value is applied
// to the selection via setFontFamily. The generics (System/Serif/Mono) are gone.
const FONT_FAMILIES = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Cambria', value: 'Cambria, serif' },
  { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
]

// F3: the default family the <select> shows when no fontFamily mark is present.
// Arial is the Google-Docs default; an unset selection displays (and on first
// pick, applies) Arial rather than a blank option.
const DEFAULT_FONT_VALUE = 'Arial, sans-serif'

// F3: sentinel for the trailing disabled "More fonts…" affordance. Selecting it
// is a no-op (the <option> is disabled) — it is a "coming soon" signpost, not a
// font value and not a picker dialog.
const MORE_FONTS_VALUE = '__more_fonts__'

const LINE_HEIGHTS = [
  { label: 'Single (1)', value: '1' },
  { label: 'Tight (1.25)', value: '1.25' },
  { label: 'Normal (1.5)', value: '1.5' },
  { label: 'Relaxed (1.75)', value: '1.75' },
  { label: 'Double (2)', value: '2' },
]

const LETTER_SPACINGS = [
  { label: 'Normal', value: '0em' },
  { label: 'Tight (−0.05em)', value: '-0.05em' },
  { label: 'Wide (0.05em)', value: '0.05em' },
  { label: 'Wider (0.1em)', value: '0.1em' },
  { label: 'Widest (0.2em)', value: '0.2em' },
]

// F4: the block-type list now lives in StylesMenu (merged "Styles" dropdown).
// Toolbar keeps the activeBlockType derivation + handleBlockTypeChange handler,
// which StylesMenu calls for a block-type choice.

/** Sentinel value for the "Auto-detect" option — not persisted to the node attribute. */
const AUTO_DETECT_VALUE = '__auto__'

// Display labels for language ids that need special casing; others are capitalized.
const LANG_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  cpp: 'C++',
  csharp: 'C#',
  fsharp: 'F#',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  xml: 'XML',
  sql: 'SQL',
  php: 'PHP',
  graphql: 'GraphQL',
  ocaml: 'OCaml',
  purescript: 'PureScript',
  powershell: 'PowerShell',
  dockerfile: 'Dockerfile',
  matlab: 'MATLAB',
  diff: 'Diff',
}

function langLabel(id: string): string {
  return LANG_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
}

// Full picker covers the supported set (C4) so every Shiki language — incl. diff (C7) — is selectable.
const CODE_LANGUAGES = [
  { label: 'Auto-detect', value: AUTO_DETECT_VALUE },
  { label: 'Plaintext', value: '' },
  ...TOP_LANGUAGES.map((id) => ({ label: langLabel(id), value: id })),
]

function parseSize(raw: string | undefined): { value: number; unit: 'pt' | 'px' } {
  if (!raw) return { value: 12, unit: 'pt' }
  if (raw.endsWith('px')) return { value: Number.parseInt(raw, 10), unit: 'px' }
  return { value: Number.parseInt(raw, 10), unit: 'pt' }
}

// Prevent the toolbar from stealing the editor selection on click.
const keepSelection = (e: React.MouseEvent) => e.preventDefault()

export function Toolbar({
  editor,
  onInsertImage,
  onOpenLink,
  onCropImage,
  onOpenPageSetup,
  onOpenWatermark,
  onOpenCustomCss,
  onToggleComments,
  commentsSidebarOpen,
  onAddComment,
  onToggleVersionHistory,
  versionHistoryOpen,
  onToggleSuggestions,
  suggestionsOpen,
  onToggleBacklinks,
  backlinksOpen,
  onToggleGrammar,
  grammarOpen = false,
  grammarEnabled = false,
  onOpenShare,
  onToggleReading,
  readingOpen,
  onTogglePresenter,
  presenterOpen,
  onExportPdf,
  onToggleSourceMode,
  sourceModeOpen,
  sourceModeDisabled,
}: Props) {
  // Reactive state — re-renders the toolbar when the selection/marks change so
  // aria-pressed and the control values track the editor.
  const s = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      // Inline marks
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      strike: ed.isActive('strike'),
      subscript: ed.isActive('subscript'),
      superscript: ed.isActive('superscript'),
      code: ed.isActive('code'),
      highlight: ed.isActive('highlight'),
      // F3: the active highlight mark's color (multicolor highlight stores it on
      // the mark's `color` attr). Undefined when no explicit color was set.
      highlightColor: ed.getAttributes('highlight').color as string | undefined,
      color: ed.getAttributes('textStyle').color as string | undefined,
      fontFamily: ed.getAttributes('textStyle').fontFamily as string | undefined,
      fontSize: ed.getAttributes('textStyle').fontSize as string | undefined,
      lineHeight: ed.getAttributes('textStyle').lineHeight as string | undefined,
      letterSpacing: ed.getAttributes('textStyle').letterSpacing as string | undefined,
      // Block types
      paragraph: ed.isActive('paragraph'),
      heading1: ed.isActive('heading', { level: 1 }),
      heading2: ed.isActive('heading', { level: 2 }),
      heading3: ed.isActive('heading', { level: 3 }),
      heading4: ed.isActive('heading', { level: 4 }),
      heading5: ed.isActive('heading', { level: 5 }),
      heading6: ed.isActive('heading', { level: 6 }),
      blockquote: ed.isActive('blockquote'),
      codeBlock: ed.isActive('codeBlock'),
      // Lists
      bulletList: ed.isActive('bulletList'),
      orderedList: ed.isActive('orderedList'),
      taskList: ed.isActive('taskList'),
      // Alignment
      alignLeft: ed.isActive({ textAlign: 'left' }),
      alignCenter: ed.isActive({ textAlign: 'center' }),
      alignRight: ed.isActive({ textAlign: 'right' }),
      alignJustify: ed.isActive({ textAlign: 'justify' }),
      // First-line indent
      firstLineIndent: Boolean(ed.getAttributes('paragraph').firstLineIndent),
      // Code block language
      codeLanguage: ed.getAttributes('codeBlock').language as string | undefined,
      // Table
      table: ed.isActive('table'),
      // Link (B6)
      link: ed.isActive('link'),
      // Image (selected node) — gates the crop button
      image: ed.isActive('image'),
      // D2: suggesting mode active
      suggesting: ed.storage.suggesting?.enabled === true,
      // S5-10: read-only "Viewing" mode (editor non-editable).
      editable: ed.isEditable,
    }),
  })

  // S5-10: the active editing mode for the right-end Editing/Suggesting/Viewing
  // dropdown. Derived from EXISTING editor state — no new mode state is stored:
  //   Viewing    = editor is non-editable (read-only)
  //   Suggesting = the D2 suggesting plugin is enabled
  //   Editing    = the default (editable, not suggesting)
  const activeMode: 'editing' | 'suggesting' | 'viewing' = !s.editable
    ? 'viewing'
    : s.suggesting
      ? 'suggesting'
      : 'editing'

  // S5-10: switch modes by flipping the EXISTING flags — no new editing logic.
  //   • Suggesting routes edits through the existing D2 track-changes marks (the
  //     dropdown only toggles the plugin flag the D2 path already honors — the
  //     G13 lesson: programmatic/IME edits still go through the marks, never a
  //     silent commit).
  //   • Viewing sets editor.setEditable(false) — typing is a no-op.
  function selectMode(mode: 'editing' | 'suggesting' | 'viewing') {
    if (mode === activeMode) return
    // Leaving a mode: re-enable editing and clear suggesting as needed.
    if (activeMode === 'viewing') editor.setEditable(true)
    if (activeMode === 'suggesting') editor.chain().focus().toggleSuggesting().run()
    // Entering the new mode.
    if (mode === 'viewing') {
      editor.setEditable(false)
    } else if (mode === 'suggesting') {
      editor.chain().focus().toggleSuggesting().run()
    }
    // 'editing' needs no extra step — the leave-cleanup above already restored it.
  }

  const modeLabel =
    activeMode === 'viewing' ? 'Viewing' : activeMode === 'suggesting' ? 'Suggesting' : 'Editing'
  const modeIcon =
    activeMode === 'viewing' ? 'visibility' : activeMode === 'suggesting' ? 'edit_note' : 'edit'

  // Derive the active block type for the <select>
  const activeBlockType = (() => {
    if (s.heading1) return 'heading1'
    if (s.heading2) return 'heading2'
    if (s.heading3) return 'heading3'
    if (s.heading4) return 'heading4'
    if (s.heading5) return 'heading5'
    if (s.heading6) return 'heading6'
    if (s.blockquote) return 'blockquote'
    if (s.codeBlock) return 'codeBlock'
    return 'paragraph'
  })()

  const { value: sizeValue, unit: sizeUnit } = parseSize(s.fontSize)
  const applySize = (value: number, unit: 'pt' | 'px') => {
    editor.chain().focus().setFontSize(`${value}${unit}`).run()
  }

  const handleBlockTypeChange = (value: string) => {
    switch (value) {
      case 'paragraph':
        editor.chain().focus().setParagraph().run()
        break
      case 'heading1':
        editor.chain().focus().toggleHeading({ level: 1 }).run()
        break
      case 'heading2':
        editor.chain().focus().toggleHeading({ level: 2 }).run()
        break
      case 'heading3':
        editor.chain().focus().toggleHeading({ level: 3 }).run()
        break
      case 'heading4':
        editor.chain().focus().toggleHeading({ level: 4 }).run()
        break
      case 'heading5':
        editor.chain().focus().toggleHeading({ level: 5 }).run()
        break
      case 'heading6':
        editor.chain().focus().toggleHeading({ level: 6 }).run()
        break
      case 'blockquote':
        editor.chain().focus().toggleBlockquote().run()
        break
      case 'codeBlock':
        editor.chain().focus().toggleCodeBlock().run()
        break
    }
  }

  // S3-3: overflow `⋯`. When the single 48px row is too narrow to show every
  // control, the trailing secondary actions collapse into a `⋯` dropdown (the
  // shared S3-2 Menu primitive). A control appears EXACTLY once — inline OR in
  // the overflow, never both.
  //
  // The decision is MEASURED, not a hardcoded width threshold: a ResizeObserver
  // reports the toolbar's available inner width, and `partitionControls`
  // (src/lib/editor/toolbar-overflow.ts) decides — from the toolbar's own
  // natural content width — whether the secondary group fits. When it does not,
  // the whole secondary group collapses into `⋯` as one unit (the group is the
  // partition's overflow bucket). The natural width is captured from the
  // rendered row's `scrollWidth` only while the group is inline, so the
  // measurement never feeds back on its own collapsed state — this dodges the
  // G12 ResizeObserver feedback loop while keeping the overflow set the REAL
  // measured hidden set rather than a guessed threshold. The CSS `overflow-x:
  // auto` on `.parchment-toolbar` is the final safety net: even if the primary
  // controls alone exceed the width, the row scrolls rather than clipping.
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [overflowed, setOverflowed] = useState(false)
  // Natural (uncollapsed) width of the full control row + the px width the
  // secondary group occupies inline, measured once the group is rendered inline.
  // Persist across renders so the collapsed pass can decide whether to expand.
  const naturalWidthRef = useRef<{ total: number; secondary: number } | null>(null)
  useEffect(() => {
    const el = toolbarRef.current
    if (!el) return

    const measure = (available: number) => {
      // Capture the natural geometry only while the secondary group is inline
      // (overflowed === false): `scrollWidth` then equals the full row width and
      // the inline secondary group's width is derivable. Reuse the last good
      // capture while collapsed so we know the expand-back boundary.
      if (!overflowed) {
        const total = el.scrollWidth
        const inlineSecondary = el.querySelectorAll('[data-toolbar-secondary]')
        let secondary = 0
        for (const node of inlineSecondary) {
          secondary += (node as HTMLElement).offsetWidth
          secondary += 2 // the 2px flex gap each control adds
        }
        naturalWidthRef.current = { total, secondary }
      }
      const nat = naturalWidthRef.current
      if (!nat) return

      // Feed the measured geometry through the pure partitioner. Two control
      // "slots": the always-inline primary block and the collapsible secondary
      // block. If the secondary slot lands in the overflow bucket, collapse it.
      const primaryWidth = Math.max(0, nat.total - nat.secondary)
      const { overflow } = partitionControls(
        [
          { id: 'primary', width: primaryWidth },
          { id: 'secondary', width: nat.secondary },
        ],
        available,
        OVERFLOW_BTN_WIDTH,
      )
      setOverflowed(overflow.some((c) => c.id === 'secondary'))
    }

    const ro = new ResizeObserver((entries) => {
      const available = entries[0]?.contentRect.width ?? el.clientWidth
      measure(available)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [overflowed])

  // The secondary actions that move into the `⋯` menu when overflowed. Each
  // re-surfaces an EXISTING handler (no new feature logic).
  const overflowItems = [
    { label: 'Page setup', icon: 'settings_overscan', onSelect: onOpenPageSetup },
    { label: 'Watermark', icon: 'branding_watermark', onSelect: onOpenWatermark },
    { label: 'Custom CSS', icon: 'css', onSelect: onOpenCustomCss },
    { label: 'Reading mode', icon: 'menu_book', onSelect: onToggleReading },
    { label: 'Presenter mode', icon: 'slideshow', onSelect: onTogglePresenter },
  ] as const

  return (
    // L1: .parchment-toolbar-bleed is the full-bleed bg/border/sticky box; the
    // inner .parchment-toolbar keeps role="toolbar" + toolbarRef (the overflow
    // ResizeObserver measures THIS centered element's width, not the viewport)
    // and re-centers the controls at the body max-width.
    <div className="parchment-toolbar-bleed">
      <div
        ref={toolbarRef}
        className="parchment-toolbar mx-auto max-w-5xl"
        role="toolbar"
        aria-label="Formatting"
      >
        {/* ── S3-3: leading actions (Undo · Redo · Print) + ⊘ placeholders ──
          Undo/Redo/Print are EXISTING actions; Spell check / Format painter /
          Zoom do NOT exist in the code and ship as visibly-disabled "coming
          soon" placeholders (finding #21), NOT real controls. ─────────────── */}
        <button
          type="button"
          aria-label="Undo"
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            undo
          </span>
        </button>
        <button
          type="button"
          aria-label="Redo"
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            redo
          </span>
        </button>
        <button
          type="button"
          aria-label="Print"
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={onExportPdf}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            print
          </span>
        </button>
        <button
          type="button"
          aria-label="Spell check"
          aria-disabled="true"
          disabled
          title="Spell check (coming soon)"
          className="parchment-toolbar-btn"
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            spellcheck
          </span>
        </button>
        <button
          type="button"
          aria-label="Format painter"
          aria-disabled="true"
          disabled
          title="Format painter (coming soon)"
          className="parchment-toolbar-btn"
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_paint
          </span>
        </button>
        <button
          type="button"
          aria-label="Zoom"
          aria-disabled="true"
          disabled
          title="Zoom (coming soon)"
          className="parchment-toolbar-btn"
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            zoom_in
          </span>
        </button>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── F4: single "Styles" dropdown — merges the former Block selector
          and the G3 named-styles menu. Block types (Normal text, Heading 1–6,
          Blockquote, Code block) route through handleBlockTypeChange; named
          styles (Title, Subtitle, Body, Emphasis, Code, + workspace styles) go
          through applyStyleProps inside StylesMenu. The value tracks the
          cursor's activeBlockType. ──────────────────────────────────────── */}
        <StylesMenu
          editor={editor}
          activeBlockType={activeBlockType}
          onBlockTypeChange={handleBlockTypeChange}
        />

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── List buttons ─────────────────────────────────────────────── */}
        <button
          type="button"
          aria-label="Bullet list"
          aria-pressed={s.bulletList}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_list_bulleted
          </span>
        </button>
        <button
          type="button"
          aria-label="Numbered list"
          aria-pressed={s.orderedList}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_list_numbered
          </span>
        </button>
        <button
          type="button"
          aria-label="Task list"
          aria-pressed={s.taskList}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            checklist
          </span>
        </button>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── Text alignment buttons ────────────────────────────────────── */}
        <button
          type="button"
          aria-label="Align left"
          aria-pressed={s.alignLeft}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_align_left
          </span>
        </button>
        <button
          type="button"
          aria-label="Align center"
          aria-pressed={s.alignCenter}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_align_center
          </span>
        </button>
        <button
          type="button"
          aria-label="Align right"
          aria-pressed={s.alignRight}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_align_right
          </span>
        </button>
        <button
          type="button"
          aria-label="Justify"
          aria-pressed={s.alignJustify}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_align_justify
          </span>
        </button>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── First-line indent ─────────────────────────────────────────── */}
        <button
          type="button"
          aria-label="First-line indent"
          aria-pressed={s.firstLineIndent}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleFirstLineIndent().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_indent_increase
          </span>
        </button>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── Inline marks ─────────────────────────────────────────────── */}
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={s.bold}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_bold
          </span>
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={s.italic}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_italic
          </span>
        </button>
        <button
          type="button"
          aria-label="Underline"
          aria-pressed={s.underline}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_underlined
          </span>
        </button>
        <button
          type="button"
          aria-label="Strikethrough"
          aria-pressed={s.strike}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_strikethrough
          </span>
        </button>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        <button
          type="button"
          aria-label="Subscript"
          aria-pressed={s.subscript}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleSubscript().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            subscript
          </span>
        </button>
        <button
          type="button"
          aria-label="Superscript"
          aria-pressed={s.superscript}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            superscript
          </span>
        </button>
        <button
          type="button"
          aria-label="Inline code"
          aria-pressed={s.code}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            code
          </span>
        </button>
        <button
          type="button"
          aria-label="Highlight"
          aria-pressed={s.highlight}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            format_ink_highlighter
          </span>
        </button>

        {/* ── F3: Highlight color picker ─────────────────────────────────────
          The Highlight extension is configured with `multicolor: true`
          (inline-extensions.ts), so setHighlight({ color }) applies the chosen
          color to the mark (stored on its `color` attr). Picking a swatch
          sets/replaces the highlight color over the selection; the value tracks
          the active mark's color. Mirrors the text-color control. ──────────── */}
        <label className="parchment-toolbar-label" htmlFor="toolbar-highlight-color">
          <span className="sr-only">Highlight color</span>
          <input
            id="toolbar-highlight-color"
            type="color"
            aria-label="Highlight color"
            value={s.highlightColor ?? '#fff176'}
            onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
            className="parchment-color-input"
          />
        </label>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        <label className="parchment-toolbar-label" htmlFor="toolbar-color">
          Color
          <input
            id="toolbar-color"
            type="color"
            aria-label="Text color"
            value={s.color ?? '#000000'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            className="parchment-color-input"
          />
        </label>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        <label className="parchment-toolbar-label" htmlFor="toolbar-font-family">
          Font
          <select
            id="toolbar-font-family"
            aria-label="Font family"
            // F3: an unset selection shows Arial (the Docs default); every entry
            // is a real CSS value applied via setFontFamily.
            value={s.fontFamily ?? DEFAULT_FONT_VALUE}
            onChange={(e) => {
              // The disabled "More fonts…" option cannot be selected, but guard
              // it anyway so the sentinel never reaches setFontFamily.
              if (e.target.value === MORE_FONTS_VALUE) return
              editor.chain().focus().setFontFamily(e.target.value).run()
            }}
            className="parchment-toolbar-select"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </option>
            ))}
            {/* F3: disabled "coming soon" affordance — no picker dialog. */}
            <option value={MORE_FONTS_VALUE} disabled>
              More fonts…
            </option>
          </select>
        </label>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        <label className="parchment-toolbar-label" htmlFor="toolbar-font-size">
          Size
          {/* F3: − chip → applySize(value − 1), preserving the unit, clamped 1–999. */}
          <button
            type="button"
            aria-label="Decrease font size"
            className="parchment-toolbar-btn parchment-size-step"
            onMouseDown={keepSelection}
            onClick={() => applySize(stepFontSize(sizeValue, -1), sizeUnit)}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              remove
            </span>
          </button>
          <input
            id="toolbar-font-size"
            type="number"
            aria-label="Font size"
            min={1}
            max={999}
            value={sizeValue}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10)
              if (!Number.isNaN(v) && v > 0) applySize(v, sizeUnit)
            }}
            className="parchment-size-input"
          />
          {/* F3: + chip → applySize(value + 1), preserving the unit, clamped 1–999. */}
          <button
            type="button"
            aria-label="Increase font size"
            className="parchment-toolbar-btn parchment-size-step"
            onMouseDown={keepSelection}
            onClick={() => applySize(stepFontSize(sizeValue, 1), sizeUnit)}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              add
            </span>
          </button>
          <button
            type="button"
            aria-label={`Font size unit: ${sizeUnit}, click to toggle`}
            className="parchment-unit-btn"
            onMouseDown={keepSelection}
            onClick={() => applySize(sizeValue, sizeUnit === 'pt' ? 'px' : 'pt')}
          >
            {sizeUnit}
          </button>
        </label>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        <label className="parchment-toolbar-label" htmlFor="toolbar-line-height">
          Line
          <select
            id="toolbar-line-height"
            aria-label="Line height"
            value={s.lineHeight ?? ''}
            onChange={(e) =>
              e.target.value === ''
                ? editor.chain().focus().unsetLineHeight().run()
                : editor.chain().focus().setLineHeight(e.target.value).run()
            }
            className="parchment-toolbar-select"
          >
            <option value="">Default</option>
            {LINE_HEIGHTS.map((lh) => (
              <option key={lh.value} value={lh.value}>
                {lh.label}
              </option>
            ))}
          </select>
        </label>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        <label className="parchment-toolbar-label" htmlFor="toolbar-letter-spacing">
          Spacing
          <select
            id="toolbar-letter-spacing"
            aria-label="Letter spacing"
            value={s.letterSpacing ?? ''}
            onChange={(e) =>
              e.target.value === ''
                ? editor.chain().focus().unsetLetterSpacing().run()
                : editor.chain().focus().setLetterSpacing(e.target.value).run()
            }
            className="parchment-toolbar-select"
          >
            <option value="">Default</option>
            {LETTER_SPACINGS.map((ls) => (
              <option key={ls.value} value={ls.value}>
                {ls.label}
              </option>
            ))}
          </select>
        </label>

        {/* ── Code block language picker (visible only when codeBlock is active) ── */}
        {s.codeBlock && (
          <>
            <span className="parchment-toolbar-sep" aria-hidden="true" />
            <label className="parchment-toolbar-label" htmlFor="toolbar-code-language">
              Lang
              <select
                id="toolbar-code-language"
                aria-label="Code block language"
                value={s.codeLanguage ?? ''}
                onChange={(e) => {
                  const chosen = e.target.value
                  if (chosen === AUTO_DETECT_VALUE) {
                    // Read active code block text and detect its language.
                    const text = getActiveCodeBlockText(editor) ?? ''
                    const { language } = detectLanguage(text)
                    editor.chain().focus().updateAttributes('codeBlock', { language }).run()
                  } else {
                    editor.chain().focus().updateAttributes('codeBlock', { language: chosen }).run()
                  }
                }}
                className="parchment-toolbar-select"
              >
                {CODE_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── Insert table (B4) ────────────────────────────────────────── */}
        <button
          type="button"
          aria-label="Insert table"
          aria-pressed={s.table}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            table
          </span>
        </button>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── Insert image (B5) ────────────────────────────────────────── */}
        <button
          type="button"
          aria-label="Insert image"
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => onInsertImage()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            image
          </span>
        </button>

        {/* ── Crop image (enabled when an image node is selected) ───────── */}
        <button
          type="button"
          aria-label="Crop image"
          className="parchment-toolbar-btn"
          disabled={!s.image}
          onMouseDown={keepSelection}
          onClick={() => onCropImage()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            crop
          </span>
        </button>

        {/* ── Link (B6) ────────────────────────────────────────────────── */}
        <button
          type="button"
          aria-label="Link"
          aria-pressed={s.link}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={onOpenLink}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            add_link
          </span>
        </button>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── Insert table of contents (B7) ────────────────────────────── */}
        <button
          type="button"
          aria-label="Insert table of contents"
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().insertToc().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            toc
          </span>
        </button>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── Insert footnote (B8) ─────────────────────────────────────── */}
        <button
          type="button"
          aria-label="Insert footnote"
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().insertFootnote().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            note_add
          </span>
        </button>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── Insert page break (B13) ──────────────────────────────────── */}
        <button
          type="button"
          aria-label="Insert page break"
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().insertPageBreak().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            insert_page_break
          </span>
        </button>

        {/* ── Insert section break (B13) ───────────────────────────────── */}
        <button
          type="button"
          aria-label="Insert section break"
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().insertSectionBreak().run()}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            newspaper
          </span>
        </button>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── S3-3: Page setup / Watermark / Custom CSS — secondary actions
          that move into the `⋯` overflow menu when the toolbar is narrow.
          Rendered inline ONLY when not overflowed (each appears exactly once,
          inline OR in `⋯`). ──────────────────────────────────────────────── */}
        {!overflowed && (
          <>
            {/* ── Page setup (B14) ─────────────────────────────────────────── */}
            <button
              type="button"
              aria-label="Page setup"
              data-toolbar-secondary
              className="parchment-toolbar-btn"
              onMouseDown={keepSelection}
              onClick={(e) => {
                e.preventDefault()
                onOpenPageSetup()
              }}
            >
              <span aria-hidden className="material-symbols-rounded text-[20px]">
                settings_overscan
              </span>
            </button>

            {/* ── G9: Watermark ────────────────────────────────────────────── */}
            <button
              type="button"
              aria-label="Watermark"
              data-toolbar-secondary
              className="parchment-toolbar-btn"
              onMouseDown={keepSelection}
              onClick={(e) => {
                e.preventDefault()
                onOpenWatermark()
              }}
            >
              <span aria-hidden className="material-symbols-rounded text-[20px]">
                branding_watermark
              </span>
            </button>

            {/* ── G17: Custom CSS ─────────────────────────────────────────── */}
            <button
              type="button"
              aria-label="Custom CSS"
              data-toolbar-secondary
              className="parchment-toolbar-btn"
              onMouseDown={keepSelection}
              onClick={(e) => {
                e.preventDefault()
                onOpenCustomCss()
              }}
            >
              <span aria-hidden className="material-symbols-rounded text-[20px]">
                css
              </span>
            </button>
          </>
        )}

        {/* ── Table context controls (visible when cursor is in a table) ── */}
        {s.table && (
          <>
            <span className="parchment-toolbar-sep" aria-hidden="true" />
            <TableControls editor={editor} />
          </>
        )}

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── F3: Add comment (anchored to selection) ───────────────────────
          Reuses the D1 create flow: opens the sidebar + signals its composer to
          open on the current selection (Editor wires onAddComment). NOT a
          parallel comment system. ──────────────────────────────────────────── */}
        <button
          type="button"
          aria-label="Add comment"
          title="Add comment on selection"
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={onAddComment}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            add_comment
          </span>
        </button>

        {/* ── D1: Toggle comments sidebar ───────────────────────────────── */}
        <button
          type="button"
          aria-label="Toggle comments"
          aria-pressed={commentsSidebarOpen}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={onToggleComments}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            comment
          </span>
        </button>

        {/* ── D3: Toggle version history panel ─────────────────────────── */}
        <button
          type="button"
          aria-label="Version history"
          aria-pressed={versionHistoryOpen}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={onToggleVersionHistory}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            history
          </span>
        </button>

        {/* ── F6: Toggle backlinks panel ───────────────────────────────── */}
        <button
          type="button"
          aria-label="Backlinks"
          aria-pressed={backlinksOpen}
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={onToggleBacklinks}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            call_received
          </span>
        </button>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── D2: Suggesting mode toggle ────────────────────────────────── */}
        <button
          type="button"
          aria-label="Suggesting mode"
          aria-pressed={suggestionsOpen}
          className={`parchment-toolbar-btn${s.suggesting ? ' parchment-toolbar-btn--suggesting' : ''}`}
          onMouseDown={keepSelection}
          onClick={() => {
            editor.chain().focus().toggleSuggesting().run()
            onToggleSuggestions()
          }}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            edit_note
          </span>
          {s.suggesting && (
            <span className="parchment-suggesting-indicator" aria-hidden="true">
              ON
            </span>
          )}
        </button>

        {/* ── K7: Grammar check toggle (LanguageTool) ─────────────────────
          Rendered ONLY when LanguageTool is enabled server-side; absent
          entirely otherwise so a disabled instance shows no grammar action. */}
        {grammarEnabled && onToggleGrammar && (
          <button
            type="button"
            aria-label="Grammar check"
            aria-pressed={grammarOpen}
            className="parchment-toolbar-btn"
            onMouseDown={keepSelection}
            onClick={onToggleGrammar}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              fact_check
            </span>
          </button>
        )}

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── G1: Share document ────────────────────────────────────────── */}
        <button
          type="button"
          aria-label="Share"
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={onOpenShare}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            share
          </span>
        </button>

        <span className="parchment-toolbar-sep" aria-hidden="true" />

        {/* ── S3-3: Reading / Presenter — secondary actions; inline only when not
          overflowed (otherwise they live in the `⋯` menu, once each). ─────── */}
        {!overflowed && (
          <>
            {/* ── G15: Reading mode toggle ─────────────────────────────────── */}
            <button
              type="button"
              aria-label="Reading mode"
              aria-pressed={readingOpen}
              data-toolbar-secondary
              className="parchment-toolbar-btn"
              onMouseDown={keepSelection}
              onClick={onToggleReading}
            >
              <span aria-hidden className="material-symbols-rounded text-[20px]">
                menu_book
              </span>
            </button>

            {/* ── G16: Presenter mode toggle (F5 fallback) ─────────────────── */}
            <button
              type="button"
              aria-label="Presenter mode"
              aria-pressed={presenterOpen}
              data-toolbar-secondary
              className="parchment-toolbar-btn"
              onMouseDown={keepSelection}
              onClick={onTogglePresenter}
            >
              <span aria-hidden className="material-symbols-rounded text-[20px]">
                slideshow
              </span>
            </button>
          </>
        )}

        {/* ── I2 Part 3: Vim markdown source mode toggle ───────────────── */}
        <button
          type="button"
          aria-label="Vim source mode"
          aria-pressed={sourceModeOpen}
          disabled={sourceModeDisabled}
          title={
            sourceModeDisabled
              ? 'Source mode is unavailable while collaborating with others'
              : 'Edit Markdown source (Vim)'
          }
          className="parchment-toolbar-btn"
          onMouseDown={keepSelection}
          onClick={onToggleSourceMode}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            terminal
          </span>
        </button>

        {/* ── S3-4: the standalone Export fieldset is removed. All formats now
          live under File → Download in the menu bar (S3-2), which reuses the
          SAME export hrefs + onExportPdf wiring this strip used. No export logic
          changed — the v0.1.0 export registry is untouched. ──────────────── */}

        {/* ── G10: Voice typing ─────────────────────────────────────────── */}
        <VoiceButton editor={editor} />

        {/* ── S3-3: overflow `⋯` — holds the secondary actions hidden at narrow
          widths (the SAME items removed from inline above; once each). Reuses
          the shared S3-2 Menu primitive. ────────────────────────────────── */}
        {overflowed && (
          <Menu
            label="More"
            items={[...overflowItems]}
            triggerClassName="parchment-toolbar-btn parchment-toolbar-overflow"
            triggerAriaLabel="More tools"
            triggerContent={
              <span aria-hidden className="material-symbols-rounded text-[20px]">
                more_horiz
              </span>
            }
          />
        )}

        {/* ── S5-10: Editing / Suggesting / Viewing mode dropdown (right end).
          Reuses the shared `.px-menu` Menu primitive (S5-3). Each row flips an
          EXISTING flag — Suggesting → the D2 track-changes plugin, Viewing →
          editor.setEditable(false). No new editing logic. The trailing margin
          pushes it to the right edge (after the overflow ⋯ when present). */}
        <Menu
          label={modeLabel}
          triggerClassName="parchment-toolbar-btn parchment-toolbar-mode"
          triggerAriaLabel={`Editing mode: ${modeLabel}`}
          triggerContent={
            <span className="parchment-toolbar-mode-trigger">
              <span aria-hidden className="material-symbols-rounded text-[20px]">
                {modeIcon}
              </span>
              <span className="parchment-toolbar-mode-label">{modeLabel}</span>
            </span>
          }
          items={(
            [
              { label: 'Editing', icon: 'edit', mode: 'editing' as const },
              { label: 'Suggesting', icon: 'edit_note', mode: 'suggesting' as const },
              { label: 'Viewing', icon: 'visibility', mode: 'viewing' as const },
            ] satisfies { label: string; icon: string; mode: typeof activeMode }[]
          ).map(({ label, icon, mode }) => ({
            label,
            icon,
            // Only attach `hint` when this is the current mode (exactOptionalPropertyTypes).
            ...(activeMode === mode ? { hint: 'Current' } : {}),
            onSelect: () => selectMode(mode),
          }))}
        />
      </div>
    </div>
  )
}
