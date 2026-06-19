'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { PageNumberFormat, PageNumberPosition } from '@/lib/editor/page-primitives'

type Props = {
  editor: Editor
  /** ProseMirror doc position of the sectionBreak node to edit. */
  pos: number
  onClose: () => void
}

const FORMAT_OPTIONS: { label: string; value: PageNumberFormat }[] = [
  { label: 'None', value: 'none' },
  { label: '1, 2, 3', value: '1' },
  { label: 'i, ii, iii', value: 'i' },
  { label: 'I, II, III', value: 'I' },
  { label: 'a, b, c', value: 'a' },
  { label: 'A, B, C', value: 'A' },
]

const POSITION_OPTIONS: { label: string; value: PageNumberPosition }[] = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
]

/**
 * SectionBreakDialog — modal for editing a sectionBreak node's attributes.
 *
 * Pre-fills from the node's current attrs (read via editor.state.doc.nodeAt(pos)).
 * On Apply: uses tr.setNodeMarkup(pos, …) to target the exact node by position —
 * more robust than relying on selection, especially when multiple section breaks exist.
 *
 * Opens via the `parchment:edit-section` CustomEvent dispatched by SectionBreakView;
 * wired in Editor.tsx.
 */
export function SectionBreakDialog({ editor, pos, onClose }: Props) {
  const titleId = useId()
  const headerTextId = useId()
  const footerTextId = useId()
  const formatId = useId()
  const positionId = useId()
  const headerInputRef = useRef<HTMLInputElement>(null)

  // Read current attrs from the node at `pos`.
  const node = editor.state.doc.nodeAt(pos)
  const initialAttrs = node?.attrs ?? {}

  const [headerText, setHeaderText] = useState<string>(
    typeof initialAttrs.headerText === 'string' ? initialAttrs.headerText : '',
  )
  const [footerText, setFooterText] = useState<string>(
    typeof initialAttrs.footerText === 'string' ? initialAttrs.footerText : '',
  )
  const [pageNumberFormat, setPageNumberFormat] = useState<PageNumberFormat>(
    (initialAttrs.pageNumberFormat as PageNumberFormat | undefined) ?? '1',
  )
  const [pageNumberPosition, setPageNumberPosition] = useState<PageNumberPosition>(
    (initialAttrs.pageNumberPosition as PageNumberPosition | undefined) ?? 'center',
  )

  // Focus the first field on open.
  useEffect(() => {
    headerInputRef.current?.focus()
  }, [])

  const handleApply = useCallback(() => {
    editor.commands.command(({ tr, dispatch }) => {
      if (dispatch) {
        tr.setNodeMarkup(pos, undefined, {
          ...initialAttrs,
          headerText,
          footerText,
          pageNumberFormat,
          pageNumberPosition,
        })
      }
      return true
    })
    onClose()
  }, [
    editor,
    pos,
    initialAttrs,
    headerText,
    footerText,
    pageNumberFormat,
    pageNumberPosition,
    onClose,
  ])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleApply()
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss on click is standard modal UX; keyboard close is handled by the inner dialog's onKeyDown
    <div
      role="presentation"
      className="parchment-dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="parchment-dialog"
        onKeyDown={handleKeyDown}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Edit section break
          </h2>
          <button
            type="button"
            aria-label="Close section break dialog"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="parchment-dialog-form">
          {/* Header text */}
          <div className="parchment-dialog-field">
            <label htmlFor={headerTextId} className="parchment-dialog-label">
              Header text
            </label>
            <input
              id={headerTextId}
              ref={headerInputRef}
              type="text"
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              placeholder="e.g. Chapter 1"
              className="parchment-dialog-input"
            />
          </div>

          {/* Footer text */}
          <div className="parchment-dialog-field">
            <label htmlFor={footerTextId} className="parchment-dialog-label">
              Footer text
            </label>
            <input
              id={footerTextId}
              type="text"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="e.g. Confidential"
              className="parchment-dialog-input"
            />
          </div>

          {/* Page number format */}
          <div className="parchment-dialog-field">
            <label htmlFor={formatId} className="parchment-dialog-label">
              Page number format
            </label>
            <select
              id={formatId}
              value={pageNumberFormat}
              onChange={(e) => setPageNumberFormat(e.target.value as PageNumberFormat)}
              className="parchment-dialog-select"
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Page number position */}
          <div className="parchment-dialog-field">
            <label htmlFor={positionId} className="parchment-dialog-label">
              Page number position
            </label>
            <select
              id={positionId}
              value={pageNumberPosition}
              onChange={(e) => setPageNumberPosition(e.target.value as PageNumberPosition)}
              className="parchment-dialog-select"
            >
              {POSITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="parchment-dialog-actions">
            <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="parchment-dialog-btn-primary">
              Apply
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
