'use client'

import type { Editor } from '@tiptap/core'
import { useEffect, useState } from 'react'
import { type NamedStyle, resolveStyleProps, type StyleProps } from '@/lib/editor/styles'

type Props = {
  editor: Editor
}

/**
 * G3: Styles dropdown. Fetches the workspace's named styles once and applies a
 * selected style's RESOLVED props (walking the basedOn chain) to the current
 * selection via the existing toolbar chain commands.
 */
export function StylesMenu({ editor }: Props) {
  const [styles, setStyles] = useState<NamedStyle[]>([])

  useEffect(() => {
    let active = true
    fetch('/api/settings/styles')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { styles?: NamedStyle[] }) => {
        if (active && Array.isArray(data.styles)) setStyles(data.styles)
      })
      .catch(() => {
        /* leave empty on failure — the control still renders the placeholder */
      })
    return () => {
      active = false
    }
  }, [])

  const apply = (id: string) => {
    if (id === '') return
    const props = resolveStyleProps(styles, id)
    applyStyleProps(editor, props)
  }

  return (
    <label className="parchment-toolbar-label" htmlFor="toolbar-styles">
      Styles
      <select
        id="toolbar-styles"
        aria-label="Apply style"
        value=""
        onChange={(e) => {
          apply(e.target.value)
          // Reset to the placeholder so the same style can be re-applied.
          e.target.value = ''
        }}
        className="parchment-toolbar-select"
      >
        <option value="">Styles…</option>
        <optgroup label="Paragraph">
          {styles
            .filter((s) => s.type === 'paragraph')
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </optgroup>
        <optgroup label="Character">
          {styles
            .filter((s) => s.type === 'character')
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </optgroup>
      </select>
    </label>
  )
}

/** Apply resolved style props to the current selection via chain commands. */
function applyStyleProps(editor: Editor, props: StyleProps): void {
  let chain = editor.chain().focus()

  if (props.fontFamily !== undefined) {
    chain =
      props.fontFamily === '' ? chain.unsetFontFamily() : chain.setFontFamily(props.fontFamily)
  }
  if (props.fontSize !== undefined && props.fontSize !== '') {
    chain = chain.setFontSize(props.fontSize)
  }
  if (props.color !== undefined && props.color !== '') {
    chain = chain.setColor(props.color)
  }
  // Marks: only toggle when the desired state differs from the current one so we
  // set (not flip) the mark on the selection.
  if (props.bold === true && !editor.isActive('bold')) chain = chain.toggleBold()
  if (props.italic === true && !editor.isActive('italic')) chain = chain.toggleItalic()
  if (props.underline === true && !editor.isActive('underline')) chain = chain.toggleUnderline()

  chain.run()
}
