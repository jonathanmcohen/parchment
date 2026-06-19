'use client'

import { type Counts, readingTimeMinutes } from '@/lib/editor/counts'

type Props = {
  pageCount: number
  full: Counts
  selection: Counts | null
}

export function StatusBar({ pageCount, full, selection }: Props) {
  const readTime = readingTimeMinutes(full.words)

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
    </div>
  )
}
