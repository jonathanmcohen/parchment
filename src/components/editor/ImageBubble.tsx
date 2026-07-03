'use client'

import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react/menus'
import { useEffect, useId, useState } from 'react'
import type { ImageAlign } from '@/lib/editor/extensions/image'

type Props = {
  editor: Editor
}

// Don't let the button's mousedown blur/clear the image NodeSelection.
const keepSelection = (e: React.MouseEvent) => e.preventDefault()

/**
 * v0.2.10: floating toolbar shown when an image is selected. Offers alignment
 * (left/center/right), an alt-text editor (a11y — kept non-empty), a caption
 * editor, and delete. Positioned above the image by Tiptap's BubbleMenu
 * (Floating UI) and portalled to the themed overlay root (the plugin's default
 * appendTo is the editor parent; BubbleMenu already escapes toolbar overflow —
 * we set placement:'top' so it sits above the picture).
 *
 * Uses its OWN pluginKey ('imageBubble') so it coexists with the text-selection
 * BubbleMenu (default key 'bubbleMenu'); the two never show together because
 * each `shouldShow` is mutually exclusive (text-range vs. image NodeSelection).
 */
export function ImageBubble({ editor }: Props) {
  const altFieldId = useId()
  const captionFieldId = useId()
  const [editing, setEditing] = useState<'none' | 'alt' | 'caption'>('none')
  const [altDraft, setAltDraft] = useState('')
  const [captionDraft, setCaptionDraft] = useState('')

  // Read the selected image's live attrs (align, alt, caption) so the toolbar
  // reflects the current node and the pressed-state on the align buttons is
  // correct. `selectedImage` returns null when the selection is not an image.
  const s = useEditorState({
    editor,
    selector: ({ editor }) => {
      const sel = editor.state.selection
      const node = sel instanceof NodeSelection ? sel.node : null
      const isImage = node?.type.name === 'image'
      return {
        isImage,
        align: (node?.attrs.align as ImageAlign | undefined) ?? 'center',
        alt: (node?.attrs.alt as string | undefined) ?? '',
        caption: (node?.attrs.caption as string | undefined) ?? '',
      }
    },
  })

  // When the selected image changes (or the bubble hides), reset the inline
  // editors to the node's current values.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-seed drafts on selection identity / attr change, not on every render
  useEffect(() => {
    setAltDraft(s.alt)
    setCaptionDraft(s.caption)
    setEditing('none')
  }, [s.isImage, s.alt, s.caption])

  const setAlign = (align: ImageAlign) => {
    editor.chain().focus().setImageAlign(align).run()
  }

  const commitAlt = () => {
    // a11y gate: keep alt non-empty. Empty draft → no-op (command returns false).
    if (editor.chain().focus().setImageAlt(altDraft).run()) {
      setEditing('none')
    }
  }

  const commitCaption = () => {
    editor.chain().focus().setImageCaption(captionDraft).run()
    setEditing('none')
  }

  const remove = () => {
    editor.chain().focus().deleteSelection().run()
  }

  return (
    <TiptapBubbleMenu
      editor={editor}
      pluginKey="imageBubble"
      className="parchment-image-bubble"
      options={{ placement: 'top', offset: 8 }}
      shouldShow={({ editor }) => {
        if (!editor.isEditable) return false
        const sel = editor.state.selection
        return sel instanceof NodeSelection && sel.node.type.name === 'image'
      }}
    >
      {editing === 'none' && (
        <div className="parchment-image-bubble-row">
          <button
            type="button"
            aria-label="Align left"
            aria-pressed={s.align === 'left'}
            className="parchment-image-bubble-btn"
            onMouseDown={keepSelection}
            onClick={() => setAlign('left')}
          >
            {/* align-left glyph */}
            <span aria-hidden="true">⌷◧</span>
          </button>
          <button
            type="button"
            aria-label="Align center"
            aria-pressed={s.align === 'center'}
            className="parchment-image-bubble-btn"
            onMouseDown={keepSelection}
            onClick={() => setAlign('center')}
          >
            <span aria-hidden="true">▣</span>
          </button>
          <button
            type="button"
            aria-label="Align right"
            aria-pressed={s.align === 'right'}
            className="parchment-image-bubble-btn"
            onMouseDown={keepSelection}
            onClick={() => setAlign('right')}
          >
            <span aria-hidden="true">◨⌷</span>
          </button>
          <span className="parchment-image-bubble-sep" aria-hidden="true" />
          <button
            type="button"
            aria-label="Edit alt text"
            className="parchment-image-bubble-btn parchment-image-bubble-btn--text"
            onMouseDown={keepSelection}
            onClick={() => setEditing('alt')}
          >
            Alt
          </button>
          <button
            type="button"
            aria-label="Edit caption"
            aria-pressed={!!s.caption}
            className="parchment-image-bubble-btn parchment-image-bubble-btn--text"
            onMouseDown={keepSelection}
            onClick={() => setEditing('caption')}
          >
            Caption
          </button>
          <span className="parchment-image-bubble-sep" aria-hidden="true" />
          <button
            type="button"
            aria-label="Delete image"
            className="parchment-image-bubble-btn parchment-image-bubble-btn--danger"
            onMouseDown={keepSelection}
            onClick={remove}
          >
            <span aria-hidden="true">🗑</span>
          </button>
        </div>
      )}

      {editing === 'alt' && (
        <div className="parchment-image-bubble-row">
          <label htmlFor={altFieldId} className="parchment-image-bubble-label">
            Alt text
          </label>
          <input
            id={altFieldId}
            type="text"
            // biome-ignore lint/a11y/noAutofocus: focus the field the user just opened via the toolbar button (transient inline editor, not on page load)
            autoFocus
            value={altDraft}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setAltDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitAlt()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setEditing('none')
              }
            }}
            placeholder="Describe the image"
            className="parchment-image-bubble-input"
          />
          <button
            type="button"
            className="parchment-image-bubble-btn parchment-image-bubble-btn--text"
            onMouseDown={keepSelection}
            onClick={commitAlt}
          >
            Save
          </button>
        </div>
      )}

      {editing === 'caption' && (
        <div className="parchment-image-bubble-row">
          <label htmlFor={captionFieldId} className="parchment-image-bubble-label">
            Caption
          </label>
          <input
            id={captionFieldId}
            type="text"
            // biome-ignore lint/a11y/noAutofocus: focus the field the user just opened via the toolbar button (transient inline editor, not on page load)
            autoFocus
            value={captionDraft}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setCaptionDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitCaption()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setEditing('none')
              }
            }}
            placeholder="Optional caption"
            className="parchment-image-bubble-input"
          />
          <button
            type="button"
            className="parchment-image-bubble-btn parchment-image-bubble-btn--text"
            onMouseDown={keepSelection}
            onClick={commitCaption}
          >
            Save
          </button>
        </div>
      )}
    </TiptapBubbleMenu>
  )
}
