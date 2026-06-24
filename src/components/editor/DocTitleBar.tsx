'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import type { ConnectionState } from '@/components/editor/StatusBar'
import { buildRenameRequest } from '@/lib/docs/rename-request'
import { type SaveStatus, saveTooltipKind } from '@/lib/docs/save-status'

// S3-1: the pinned doc title bar (NEW). A near-pure shell over EXISTING
// Editor.tsx handlers, plus two small honestly-flagged NEW bits:
//   (a) the inline-title save via the EXISTING title-only `/rename` endpoint
//       (DECISION 3) — it writes ONLY the title and can never clobber the body;
//   (b) the save-status slot driven by S3-1's state (DECISION 4); S5-9 supplies
//       the COPY.
// star / move are visibly-disabled "coming soon" placeholders — no backing
// files-side endpoint is reachable from the editor today (placeholder honesty).

// C3: the COPY now routes through the editor.saveStatus i18n keys (en catalog;
// other locales fall back to en). This maps the STATE to a key name only — the
// actual string is resolved via useTranslations in the component. 'idle' has no
// key (the slot renders nothing).
function saveStatusKey(status: SaveStatus): 'saving' | 'saved' | null {
  switch (status) {
    case 'saving':
      return 'saving'
    case 'saved':
      return 'saved'
    default:
      return null
  }
}

function InlineTitle({ docId, initialTitle }: { docId: string; initialTitle: string }) {
  const [title, setTitle] = useState(initialTitle)
  const lastSaved = useRef(initialTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = useCallback(() => {
    const req = buildRenameRequest(docId, title, lastSaved.current)
    if (!req) {
      // Empty or unchanged → revert any whitespace-only edit, persist nothing.
      setTitle(lastSaved.current)
      return
    }
    lastSaved.current = req.body.title
    setTitle(req.body.title)
    // Title-only endpoint — never the body-PUT (I4 clobber guard).
    void fetch(req.url, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
    })
  }, [docId, title])

  return (
    <input
      ref={inputRef}
      type="text"
      className="parchment-titlebar-title"
      value={title}
      aria-label="Document title"
      title={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          inputRef.current?.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setTitle(lastSaved.current)
          inputRef.current?.blur()
        }
      }}
    />
  )
}

export type DocTitleBarProps = {
  docId: string
  initialTitle: string
  saveStatus: SaveStatus
  /**
   * C3: live collab connection state (computed in Editor.tsx). Drives the
   * connection-aware tooltip on the save-status text — synced copy when collab
   * is healthy/online, offline copy when it is syncing/unreachable.
   */
  connection: ConnectionState
  onToggleComments: () => void
  onToggleVersionHistory: () => void
  onOpenShare: () => void
  /** S2-5 avatar cluster, rendered at the far right. */
  avatar?: React.ReactNode
}

export function DocTitleBar({
  docId,
  initialTitle,
  saveStatus,
  connection,
  onToggleComments,
  onToggleVersionHistory,
  onOpenShare,
  avatar,
}: DocTitleBarProps) {
  const t = useTranslations('editor.saveStatus')
  const [starred, setStarred] = useState(false)
  const statusKey = saveStatusKey(saveStatus)
  const status = statusKey ? t(statusKey) : ''
  // C3: the tooltip reflects the LIVE connection — only a confirmed-online link
  // claims "synced to collab service"; syncing/offline show the offline copy.
  const saveTooltip =
    saveTooltipKind(connection) === 'synced' ? t('tooltipSynced') : t('tooltipOffline')

  return (
    // L2: the <header> is the full-bleed bg/border/sticky box; the inner
    // .parchment-titlebar-inner re-centers the controls at the body max-width.
    <header className="parchment-titlebar">
      <div className="parchment-titlebar-inner mx-auto max-w-5xl">
        <a href="/files" className="parchment-titlebar-glyph">
          <span aria-hidden className="material-symbols-rounded text-[24px]">
            description
          </span>
          <span className="sr-only">Back to files</span>
        </a>

        <InlineTitle docId={docId} initialTitle={initialTitle} />

        {/* star + move are placeholders (no editor-side endpoint) — visibly inert. */}
        <button
          type="button"
          className="parchment-titlebar-iconbtn"
          aria-pressed={starred}
          aria-label={starred ? 'Unstar' : 'Star'}
          title="Star"
          onClick={() => setStarred((v) => !v)}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            {starred ? 'star' : 'star_border'}
          </span>
        </button>
        <button
          type="button"
          className="parchment-titlebar-iconbtn"
          aria-label="Move"
          aria-disabled
          disabled
          title="Move (coming soon)"
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            drive_file_move
          </span>
        </button>

        {status && (
          <span
            className="parchment-titlebar-savestatus"
            role="status"
            aria-live="polite"
            title={saveTooltip}
          >
            {status}
          </span>
        )}

        <span className="parchment-titlebar-spacer" />

        <button
          type="button"
          className="parchment-titlebar-iconbtn"
          aria-label="Comments"
          title="Comments"
          onClick={onToggleComments}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            chat_bubble
          </span>
        </button>
        <button
          type="button"
          className="parchment-titlebar-iconbtn"
          aria-label="Version history"
          title="Version history"
          onClick={onToggleVersionHistory}
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            history
          </span>
        </button>

        <button type="button" className="parchment-titlebar-share" onClick={onOpenShare}>
          <span aria-hidden className="material-symbols-rounded text-[16px]">
            group
          </span>
          Share
        </button>

        {avatar}
      </div>
    </header>
  )
}
