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

const FONT_FAMILIES = [
  { label: 'System', value: '' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Mono', value: 'ui-monospace, monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
]

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

const BLOCK_TYPES = [
  { label: 'Paragraph', value: 'paragraph' },
  { label: 'Heading 1', value: 'heading1' },
  { label: 'Heading 2', value: 'heading2' },
  { label: 'Heading 3', value: 'heading3' },
  { label: 'Heading 4', value: 'heading4' },
  { label: 'Heading 5', value: 'heading5' },
  { label: 'Heading 6', value: 'heading6' },
  { label: 'Blockquote', value: 'blockquote' },
  { label: 'Code block', value: 'codeBlock' },
]

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
    }),
  })

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
  // the overflow, never both. Visibility is driven by a ResizeObserver on the
  // toolbar (the same pattern used for page-fit), not by JS width math on every
  // control, so it cannot duplicate or drop a control.
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [overflowed, setOverflowed] = useState(false)
  useEffect(() => {
    const el = toolbarRef.current
    if (!el) return
    // Collapse the secondary group below this width threshold. The threshold is
    // a single boolean flip (not per-control measurement) to dodge the G12
    // ResizeObserver feedback loop.
    const THRESHOLD = 920
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth
      setOverflowed(w < THRESHOLD)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The secondary actions that move into the `⋯` menu when overflowed. Each
  // re-surfaces an EXISTING handler (no new feature logic).
  const overflowItems = [
    { label: 'Page setup', icon: 'settings_overscan', onSelect: onOpenPageSetup },
    { label: 'Watermark', icon: 'branding_watermark', onSelect: onOpenWatermark },
    { label: 'Custom CSS', icon: 'code', onSelect: onOpenCustomCss },
    { label: 'Reading mode', icon: 'menu_book', onSelect: onToggleReading },
    { label: 'Presenter mode', icon: 'slideshow', onSelect: onTogglePresenter },
  ] as const

  return (
    <div ref={toolbarRef} className="parchment-toolbar" role="toolbar" aria-label="Formatting">
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

      {/* ── Block type selector ───────────────────────────────────────── */}
      <label className="parchment-toolbar-label" htmlFor="toolbar-block-type">
        Block
        <select
          id="toolbar-block-type"
          aria-label="Block type"
          value={activeBlockType}
          onChange={(e) => {
            handleBlockTypeChange(e.target.value)
            e.target.focus()
          }}
          className="parchment-toolbar-select"
        >
          {BLOCK_TYPES.map((bt) => (
            <option key={bt.value} value={bt.value}>
              {bt.label}
            </option>
          ))}
        </select>
      </label>

      <span className="parchment-toolbar-sep" aria-hidden="true" />

      {/* ── G3: Named styles dropdown ─────────────────────────────────── */}
      <StylesMenu editor={editor} />

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
        •≡
      </button>
      <button
        type="button"
        aria-label="Numbered list"
        aria-pressed={s.orderedList}
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1≡
      </button>
      <button
        type="button"
        aria-label="Task list"
        aria-pressed={s.taskList}
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        ☑
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
        ⬛L
      </button>
      <button
        type="button"
        aria-label="Align center"
        aria-pressed={s.alignCenter}
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >
        ⬛C
      </button>
      <button
        type="button"
        aria-label="Align right"
        aria-pressed={s.alignRight}
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      >
        ⬛R
      </button>
      <button
        type="button"
        aria-label="Justify"
        aria-pressed={s.alignJustify}
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
      >
        ⬛J
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
        ¶→
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
        <strong>B</strong>
      </button>
      <button
        type="button"
        aria-label="Italic"
        aria-pressed={s.italic}
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        aria-label="Underline"
        aria-pressed={s.underline}
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span style={{ textDecoration: 'underline' }}>U</span>
      </button>
      <button
        type="button"
        aria-label="Strikethrough"
        aria-pressed={s.strike}
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span style={{ textDecoration: 'line-through' }}>S</span>
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
        X<sub>2</sub>
      </button>
      <button
        type="button"
        aria-label="Superscript"
        aria-pressed={s.superscript}
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
      >
        X<sup>2</sup>
      </button>
      <button
        type="button"
        aria-label="Inline code"
        aria-pressed={s.code}
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        {'</>'}
      </button>
      <button
        type="button"
        aria-label="Highlight"
        aria-pressed={s.highlight}
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <span style={{ background: 'var(--highlight)', padding: '0 2px' }}>H</span>
      </button>

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
          value={s.fontFamily ?? ''}
          onChange={(e) =>
            e.target.value === ''
              ? editor.chain().focus().unsetFontFamily().run()
              : editor.chain().focus().setFontFamily(e.target.value).run()
          }
          className="parchment-toolbar-select"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <span className="parchment-toolbar-sep" aria-hidden="true" />

      <label className="parchment-toolbar-label" htmlFor="toolbar-font-size">
        Size
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
        ⊞
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
        🖼
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
        ✂
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
        🔗
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
        ☰
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
        fn
        <sup style={{ fontSize: '0.6em', lineHeight: 1 }}>†</sup>
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
        ⏎p
      </button>

      {/* ── Insert section break (B13) ───────────────────────────────── */}
      <button
        type="button"
        aria-label="Insert section break"
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().insertSectionBreak().run()}
      >
        §
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
            className="parchment-toolbar-btn"
            onMouseDown={keepSelection}
            onClick={(e) => {
              e.preventDefault()
              onOpenPageSetup()
            }}
          >
            ☰⊞
          </button>

          {/* ── G9: Watermark ────────────────────────────────────────────── */}
          <button
            type="button"
            aria-label="Watermark"
            className="parchment-toolbar-btn"
            onMouseDown={keepSelection}
            onClick={(e) => {
              e.preventDefault()
              onOpenWatermark()
            }}
          >
            ≋
          </button>

          {/* ── G17: Custom CSS ─────────────────────────────────────────── */}
          <button
            type="button"
            aria-label="Custom CSS"
            className="parchment-toolbar-btn"
            onMouseDown={keepSelection}
            onClick={(e) => {
              e.preventDefault()
              onOpenCustomCss()
            }}
          >
            {'</>'}
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

      {/* ── D1: Toggle comments sidebar ───────────────────────────────── */}
      <button
        type="button"
        aria-label="Toggle comments"
        aria-pressed={commentsSidebarOpen}
        className="parchment-toolbar-btn"
        onMouseDown={keepSelection}
        onClick={onToggleComments}
      >
        💬
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
        🕐
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
        🔙
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
        <span aria-hidden="true">✎?</span>
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
          <span aria-hidden="true">📝</span>
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
        🔗
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
            className="parchment-toolbar-btn"
            onMouseDown={keepSelection}
            onClick={onToggleReading}
          >
            📖
          </button>

          {/* ── G16: Presenter mode toggle (F5 fallback) ─────────────────── */}
          <button
            type="button"
            aria-label="Presenter mode"
            aria-pressed={presenterOpen}
            className="parchment-toolbar-btn"
            onMouseDown={keepSelection}
            onClick={onTogglePresenter}
          >
            ▶
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
        {'</>'}
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
    </div>
  )
}
