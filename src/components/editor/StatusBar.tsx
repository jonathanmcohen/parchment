'use client'

import { type Counts, readingTimeMinutes } from '@/lib/editor/counts'

type ReaderInfo = { name: string; color: string }

type Props = {
  pageCount: number
  full: Counts
  selection: Counts | null
  readers?: ReaderInfo[]
}

export function StatusBar({ pageCount, full, selection, readers = [] }: Props) {
  const readTime = readingTimeMinutes(full.words)
  const names = readers.map((r) => r.name)

  return (
    <div role="status" aria-live="polite" className="parchment-status-bar">
      <span>Page {pageCount}</span>
      <span aria-hidden>·</span>
      {selection !== null ? (
        <span>
          Selection: {selection.words} {selection.words === 1 ? 'word' : 'words'} ·{' '}
          {selection.chars} {selection.chars === 1 ? 'char' : 'chars'}
        </span>
      ) : (
        <span>
          {full.words} {full.words === 1 ? 'word' : 'words'} · {full.chars}{' '}
          {full.chars === 1 ? 'char' : 'chars'} · {readTime} min read
        </span>
      )}
      {readers.length > 0 && (
        <>
          <span aria-hidden>·</span>
          {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label is intentional on this status span to describe the presence count to screen readers */}
          <span
            aria-label={`${readers.length} other ${readers.length === 1 ? 'person' : 'people'} reading: ${names.join(', ')}`}
          >
            👁 {readers.length} reading
          </span>
        </>
      )}
    </div>
  )
}
