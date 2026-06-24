'use client'

import type { Editor } from '@tiptap/core'
import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_STYLES,
  type NamedStyle,
  resolveStyleProps,
  type StyleProps,
} from '@/lib/editor/styles'

type Props = {
  editor: Editor
  /**
   * F4: the cursor's active block type, derived in Toolbar from EXISTING editor
   * state (paragraph / heading1–6 / blockquote / codeBlock). The merged control's
   * value reflects this so the dropdown tracks the cursor's block.
   */
  activeBlockType: string
  /** F4: route a block-type choice through Toolbar's existing handleBlockTypeChange. */
  onBlockTypeChange: (value: string) => void
}

// F4: the block types shown FIRST in the merged dropdown, with display labels.
// "Normal text" is the relabel of the `paragraph` block type (display name only);
// the heading values match Toolbar.handleBlockTypeChange. Blockquote/Code block
// stay available as block types.
const BLOCK_OPTIONS = [
  { label: 'Normal text', value: 'paragraph' },
  { label: 'Heading 1', value: 'heading1' },
  { label: 'Heading 2', value: 'heading2' },
  { label: 'Heading 3', value: 'heading3' },
  { label: 'Heading 4', value: 'heading4' },
  { label: 'Heading 5', value: 'heading5' },
  { label: 'Heading 6', value: 'heading6' },
  { label: 'Blockquote', value: 'blockquote' },
  { label: 'Code block', value: 'codeBlock' },
] as const

const BLOCK_VALUES = new Set<string>(BLOCK_OPTIONS.map((b) => b.value))

// F4: option-value prefix that namespaces a named style so its id can never
// collide with a block-type value (e.g. a workspace style id of "paragraph").
const STYLE_PREFIX = 'style:'

/**
 * F4: the single "Styles" dropdown. Lists the block types first (Normal text,
 * Heading 1–6, Blockquote, Code block) then the workspace's named styles
 * (Title, Subtitle, Body, Emphasis, Code, + any custom styles). A block-type
 * choice routes through Toolbar's existing `handleBlockTypeChange`; a named-style
 * choice applies the style's RESOLVED props via `applyStyleProps`. Reuses the G3
 * workspace-styles fetch — an empty/failed fetch falls back to DEFAULT_STYLES so
 * the block types + builtin styles always render.
 */
export function StylesMenu({ editor, activeBlockType, onBlockTypeChange }: Props) {
  const [styles, setStyles] = useState<NamedStyle[]>([...DEFAULT_STYLES])

  useEffect(() => {
    let active = true
    fetch('/api/settings/styles')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { styles?: NamedStyle[] }) => {
        // An empty workspace list still shows DEFAULT_STYLES; only replace when
        // the fetch yields a non-empty list.
        if (active && Array.isArray(data.styles) && data.styles.length > 0) {
          setStyles(data.styles)
        }
      })
      .catch(() => {
        /* leave DEFAULT_STYLES on failure — block types + builtins still render */
      })
    return () => {
      active = false
    }
  }, [])

  const paragraphStyles = useMemo(() => styles.filter((s) => s.type === 'paragraph'), [styles])
  const characterStyles = useMemo(() => styles.filter((s) => s.type === 'character'), [styles])

  const handleChange = (raw: string) => {
    if (raw.startsWith(STYLE_PREFIX)) {
      const id = raw.slice(STYLE_PREFIX.length)
      if (id === '') return
      applyStyleProps(editor, resolveStyleProps(styles, id))
      return
    }
    if (BLOCK_VALUES.has(raw)) onBlockTypeChange(raw)
  }

  return (
    <label className="parchment-toolbar-label" htmlFor="toolbar-styles">
      Styles
      <select
        id="toolbar-styles"
        aria-label="Styles"
        // The control's value reflects the cursor's block type; selecting a named
        // style applies it without changing the block, so the value stays on the
        // current block (named styles are not block types).
        value={activeBlockType}
        onChange={(e) => {
          handleChange(e.target.value)
          e.target.focus()
        }}
        className="parchment-toolbar-select"
      >
        {BLOCK_OPTIONS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
        {paragraphStyles.length > 0 && (
          <optgroup label="Paragraph styles">
            {paragraphStyles.map((s) => (
              <option key={s.id} value={`${STYLE_PREFIX}${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
        )}
        {characterStyles.length > 0 && (
          <optgroup label="Text styles">
            {characterStyles.map((s) => (
              <option key={s.id} value={`${STYLE_PREFIX}${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
        )}
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
