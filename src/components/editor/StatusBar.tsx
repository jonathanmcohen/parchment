'use client'

type Props = {
  pageCount: number
  wordCount: number
}

export function StatusBar({ pageCount, wordCount }: Props) {
  return (
    <div role="status" className="parchment-status-bar">
      Page {pageCount} · {wordCount} {wordCount === 1 ? 'word' : 'words'}
    </div>
  )
}
