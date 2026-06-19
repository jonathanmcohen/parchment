'use client'

import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react/menus'

type Props = {
  editor: Editor
}

const keepSelection = (e: React.MouseEvent) => e.preventDefault()

export function BubbleMenu({ editor }: Props) {
  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      code: editor.isActive('code'),
      highlight: editor.isActive('highlight'),
    }),
  })

  return (
    <TiptapBubbleMenu editor={editor} className="parchment-bubble-menu">
      <button
        type="button"
        aria-label="Bold"
        aria-pressed={s.bold}
        className="parchment-bubble-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        aria-label="Italic"
        aria-pressed={s.italic}
        className="parchment-bubble-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        aria-label="Underline"
        aria-pressed={s.underline}
        className="parchment-bubble-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span style={{ textDecoration: 'underline' }}>U</span>
      </button>
      <button
        type="button"
        aria-label="Inline code"
        aria-pressed={s.code}
        className="parchment-bubble-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        {'</>'}
      </button>
      <button
        type="button"
        aria-label="Highlight"
        aria-pressed={s.highlight}
        className="parchment-bubble-btn"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <span style={{ background: '#fef08a', padding: '0 2px' }}>H</span>
      </button>
    </TiptapBubbleMenu>
  )
}
