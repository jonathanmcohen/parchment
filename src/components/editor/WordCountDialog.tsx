'use client'

import { useId } from 'react'
import { type Counts, readingTimeMinutes } from '@/lib/editor/counts'

// S3-2 (Tools → Word count) / S3-6: a small word-count modal sourced from the
// counts already computed by useEditorState in Editor.tsx (Editor.tsx:971–984).
// No new count logic — it only displays the existing `full`/`selection` counts,
// plus the read-time that S3-6 removes from the always-on status bar (surfaced
// here on demand instead). Reuses the established `.parchment-dialog*` shell.

export type WordCountDialogProps = {
  full: Counts
  selection: Counts | null
  pageCount: number
  onClose: () => void
}

export function WordCountDialog({ full, selection, pageCount, onClose }: WordCountDialogProps) {
  const titleId = useId()
  const readTime = readingTimeMinutes(full.words)

  const rows: { label: string; value: string }[] = [
    { label: 'Pages', value: String(pageCount) },
    { label: 'Words', value: String(full.words) },
    { label: 'Characters', value: String(full.chars) },
    { label: 'Reading time', value: `${readTime} min` },
  ]

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss on click is standard modal UX
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
        className="parchment-dialog parchment-wordcount-dialog"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Word count
          </h2>
          <button
            type="button"
            className="parchment-dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              close
            </span>
          </button>
        </div>

        <dl className="parchment-wordcount-list">
          {rows.map((row) => (
            <div key={row.label} className="parchment-wordcount-row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
          {selection !== null && (
            <div className="parchment-wordcount-row parchment-wordcount-row--selection">
              <dt>Selection</dt>
              <dd>
                {selection.words} {selection.words === 1 ? 'word' : 'words'} · {selection.chars}{' '}
                {selection.chars === 1 ? 'char' : 'chars'}
              </dd>
            </div>
          )}
        </dl>

        <div className="parchment-dialog-actions">
          <button type="button" className="parchment-dialog-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
