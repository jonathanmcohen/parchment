'use client'

import type { Counts } from '@/lib/editor/counts'

type ReaderInfo = { name: string; color: string }

// S3-6: the connection state folded in from OfflineIndicator. Green dot when
// online (no label), amber when syncing, gray when offline.
export type ConnectionState = 'online' | 'syncing' | 'offline'

// LT5-2: the active editing mode (mirrors the Toolbar's right-end dropdown).
// Threaded from the editor so the status bar shows the live mode before the
// connection dot. Same derivation as Toolbar (read-only → viewing, D2
// suggesting plugin → suggesting, else editing) — no new mode state.
export type EditorMode = 'editing' | 'suggesting' | 'viewing'

type Props = {
  pageCount: number
  full: Counts
  selection: Counts | null
  readers?: ReaderInfo[]
  /** S3-6: connection dot state (folded in from OfflineIndicator). */
  connection?: ConnectionState
  /** LT5-2: live editing mode label, rendered before the connection dot. */
  mode?: EditorMode
  /** S3-2/S3-6: clicking the word count opens the Tools → Word count modal. */
  onOpenWordCount?: () => void
}

const MODE_LABEL: Record<EditorMode, string> = {
  editing: 'Editing',
  suggesting: 'Suggesting',
  viewing: 'Viewing',
}

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  online: '',
  syncing: 'Syncing…',
  offline: 'Offline',
}

// S3-6: a slim 24px white footer with three slots (left/center/right):
//   left   — Page N of M
//   center — word count (clickable → Tools → Word count modal; "min read"
//            removed from the default view, surfaced only inside that modal)
//   right  — reading-presence count + a colored connection dot
export function StatusBar({
  pageCount,
  full,
  selection,
  readers = [],
  connection = 'online',
  mode,
  onOpenWordCount,
}: Props) {
  const names = readers.map((r) => r.name)
  const connectionLabel = CONNECTION_LABEL[connection]
  const modeLabel = mode ? MODE_LABEL[mode] : null

  // LT5-3: the always-on bar shows words only ("116 words"); the "· N chars"
  // detail moved into the Tools → Word count modal (WordCountDialog already
  // lists Characters). A live selection still surfaces its word count inline.
  const countText =
    selection !== null
      ? `Selection: ${selection.words} ${selection.words === 1 ? 'word' : 'words'}`
      : `${full.words} ${full.words === 1 ? 'word' : 'words'}`

  return (
    // F8+L3: the bar is pinned full-width to the viewport bottom via
    // .parchment-status-bar (fixed, edge-to-edge bg + top chrome border). The
    // inner .parchment-status-inner (mx-auto max-w-5xl) re-centers the three
    // slots at the body max-width — same full-bleed-bg/centered-content pattern
    // as the L-chrome-stack bars. Counts / word-count modal / connection-dot
    // wiring is unchanged (layout only).
    <div role="status" aria-live="polite" className="parchment-status-bar">
      <div className="parchment-status-inner mx-auto max-w-5xl">
        <span className="parchment-status-slot parchment-status-slot--left">
          Page {pageCount} of {pageCount}
        </span>

        <span className="parchment-status-slot parchment-status-slot--center">
          {onOpenWordCount ? (
            <button type="button" className="parchment-status-wordcount" onClick={onOpenWordCount}>
              {countText}
            </button>
          ) : (
            <span>{countText}</span>
          )}
        </span>

        <span className="parchment-status-slot parchment-status-slot--right">
          {readers.length > 0 && (
            // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label describes the presence count to screen readers
            <span
              className="parchment-status-readers"
              aria-label={`${readers.length} other ${readers.length === 1 ? 'person' : 'people'} reading: ${names.join(', ')}`}
            >
              <span aria-hidden className="material-symbols-rounded text-[16px]">
                visibility
              </span>
              {readers.length}
            </span>
          )}
          {modeLabel && (
            <span className="parchment-status-mode text-[var(--muted)]">{modeLabel}</span>
          )}
          <span className="parchment-status-connection" data-state={connection}>
            <span aria-hidden className="parchment-status-dot" />
            {connectionLabel ? (
              <span>{connectionLabel}</span>
            ) : (
              <span className="sr-only">Online</span>
            )}
          </span>
        </span>
      </div>
    </div>
  )
}
