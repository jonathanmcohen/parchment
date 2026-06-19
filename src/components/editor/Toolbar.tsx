'use client'

import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'

type Props = {
  editor: Editor
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

function parseSize(raw: string | undefined): { value: number; unit: 'pt' | 'px' } {
  if (!raw) return { value: 12, unit: 'pt' }
  if (raw.endsWith('px')) return { value: Number.parseInt(raw, 10), unit: 'px' }
  return { value: Number.parseInt(raw, 10), unit: 'pt' }
}

// Prevent the toolbar from stealing the editor selection on click.
const keepSelection = (e: React.MouseEvent) => e.preventDefault()

export function Toolbar({ editor }: Props) {
  // Reactive state — re-renders the toolbar when the selection/marks change so
  // aria-pressed and the control values track the editor.
  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      subscript: editor.isActive('subscript'),
      superscript: editor.isActive('superscript'),
      code: editor.isActive('code'),
      highlight: editor.isActive('highlight'),
      color: editor.getAttributes('textStyle').color as string | undefined,
      fontFamily: editor.getAttributes('textStyle').fontFamily as string | undefined,
      fontSize: editor.getAttributes('textStyle').fontSize as string | undefined,
      lineHeight: editor.getAttributes('textStyle').lineHeight as string | undefined,
      letterSpacing: editor.getAttributes('textStyle').letterSpacing as string | undefined,
    }),
  })

  const { value: sizeValue, unit: sizeUnit } = parseSize(s.fontSize)
  const applySize = (value: number, unit: 'pt' | 'px') => {
    editor.chain().focus().setFontSize(`${value}${unit}`).run()
  }

  return (
    <div className="parchment-toolbar" role="toolbar" aria-label="Formatting">
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
    </div>
  )
}
