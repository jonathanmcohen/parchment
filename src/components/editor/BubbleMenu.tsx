'use client'

import type { Editor } from '@tiptap/core'
import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react/menus'

type Props = {
  editor: Editor
}

export function BubbleMenu({ editor }: Props) {
  return (
    <TiptapBubbleMenu editor={editor} className="parchment-bubble-menu">
      <button
        type="button"
        aria-label="Bold"
        aria-pressed={editor.isActive('bold')}
        className="parchment-bubble-btn"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </button>

      <button
        type="button"
        aria-label="Italic"
        aria-pressed={editor.isActive('italic')}
        className="parchment-bubble-btn"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </button>

      <button
        type="button"
        aria-label="Underline"
        aria-pressed={editor.isActive('underline')}
        className="parchment-bubble-btn"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span style={{ textDecoration: 'underline' }}>U</span>
      </button>

      <button
        type="button"
        aria-label="Inline code"
        aria-pressed={editor.isActive('code')}
        className="parchment-bubble-btn"
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        {'</>'}
      </button>

      <button
        type="button"
        aria-label="Highlight"
        aria-pressed={editor.isActive('highlight')}
        className="parchment-bubble-btn"
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <span style={{ background: '#fef08a', padding: '0 2px' }}>H</span>
      </button>
    </TiptapBubbleMenu>
  )
}
