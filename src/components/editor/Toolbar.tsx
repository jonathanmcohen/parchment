'use client'

import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { TableControls } from '@/components/editor/TableControls'

type Props = {
  editor: Editor
  docId: string
  onInsertImage: (prefillSrc?: string) => void
  onOpenLink: () => void
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

const CODE_LANGUAGES = [
  { label: 'Plaintext', value: '' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Python', value: 'python' },
  { label: 'Go', value: 'go' },
  { label: 'Rust', value: 'rust' },
  { label: 'HTML', value: 'html' },
  { label: 'CSS', value: 'css' },
  { label: 'JSON', value: 'json' },
  { label: 'Bash', value: 'bash' },
  { label: 'SQL', value: 'sql' },
  { label: 'Markdown', value: 'markdown' },
]

function parseSize(raw: string | undefined): { value: number; unit: 'pt' | 'px' } {
  if (!raw) return { value: 12, unit: 'pt' }
  if (raw.endsWith('px')) return { value: Number.parseInt(raw, 10), unit: 'px' }
  return { value: Number.parseInt(raw, 10), unit: 'pt' }
}

// Prevent the toolbar from stealing the editor selection on click.
const keepSelection = (e: React.MouseEvent) => e.preventDefault()

export function Toolbar({ editor, docId: _docId, onInsertImage, onOpenLink }: Props) {
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

  return (
    <div className="parchment-toolbar" role="toolbar" aria-label="Formatting">
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
        <span style={{ background: '#fef08a', padding: '0 2px' }}>H</span>
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
              onChange={(e) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes('codeBlock', { language: e.target.value })
                  .run()
              }
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

      {/* ── Table context controls (visible when cursor is in a table) ── */}
      {s.table && (
        <>
          <span className="parchment-toolbar-sep" aria-hidden="true" />
          <TableControls editor={editor} />
        </>
      )}
    </div>
  )
}
