'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useRef, useState, useTransition } from 'react'
import type { ConnectionState } from '@/components/editor/StatusBar'
import { Tooltip } from '@/components/ui/Tooltip'
import { renameDocumentAction } from '@/lib/docs/rename-action'
import { buildRenameRequest } from '@/lib/docs/rename-request'
import { type SaveStatus, saveTooltipKind } from '@/lib/docs/save-status'
import { buildStarRequest } from '@/lib/docs/star-request'

// S3-1: the pinned doc title bar (NEW). A near-pure shell over EXISTING
// Editor.tsx handlers, plus two small honestly-flagged NEW bits:
//   (a) the inline-title save via the EXISTING title-only `/rename` endpoint
//       (DECISION 3) — it writes ONLY the title and can never clobber the body;
//   (b) the save-status slot driven by S3-1's state (DECISION 4); S5-9 supplies
//       the COPY.
// C4: Star now persists via the EXISTING `POST /api/docs/:id/star` endpoint —
// the SAME one FileManager's row star uses (REUSE, no new backend). The icon is
// seeded from the server-rendered `initialStarred` so it reflects reality on
// mount and survives reload. Move stays a visibly-disabled "coming soon"
// placeholder — there is no editor-side move endpoint today (placeholder
// honesty). All four icons (Star, Move, Comments, Version history) carry a
// visible hover/focus Tooltip (S5-2) on top of their aria-label.

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
  const [, startTransition] = useTransition()
  const [title, setTitle] = useState(initialTitle)
  const lastSaved = useRef(initialTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = useCallback(() => {
    const prev = lastSaved.current
    const req = buildRenameRequest(docId, title, prev)
    if (!req) {
      // Empty or unchanged → revert any whitespace-only edit, persist nothing.
      setTitle(prev)
      return
    }
    const nextTitle = req.body.title
    lastSaved.current = nextTitle
    setTitle(nextTitle)
    // P3 (v0.1.7): rename via a Server Action — title-only, never the body-PUT,
    // preserving the I4 clobber guard. A route-handler revalidatePath could only
    // bust the SERVER cache and the prior router.refresh only refreshed THIS
    // route, so a client-nav to /files showed the stale title. A Server Action's
    // revalidatePath is streamed back in the action response, invalidating the
    // CLIENT Router Cache for /files so the next navigation is fresh.
    startTransition(async () => {
      const res = await renameDocumentAction(docId, nextTitle)
      if ('error' in res) {
        // Server rejected — revert the optimistic title to the last good value.
        lastSaved.current = prev
        setTitle(prev)
      }
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
  /**
   * C4: the doc's current starred state, server-rendered from `documents.starred`
   * so the Star icon reflects reality on mount and survives reload. The toggle
   * persists back via the EXISTING `POST /api/docs/:id/star` endpoint.
   */
  initialStarred: boolean
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
  initialStarred,
  saveStatus,
  connection,
  onToggleComments,
  onToggleVersionHistory,
  onOpenShare,
  avatar,
}: DocTitleBarProps) {
  const t = useTranslations('editor.saveStatus')
  // C4: seed from the server-rendered starred flag so the icon reflects reality
  // on mount (survives reload). The toggle persists via the EXISTING star
  // endpoint — optimistic flip, revert on a non-ok/failed response so the icon
  // never claims a state the server rejected.
  const [starred, setStarred] = useState(initialStarred)
  const toggleStar = useCallback(() => {
    const next = !starred
    setStarred(next)
    const req = buildStarRequest(docId, next)
    void fetch(req.url, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
    })
      .then((res) => {
        if (!res.ok) setStarred(!next)
      })
      .catch(() => {
        setStarred(!next)
      })
  }, [docId, starred])
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

        {/* C4: Star persists via the EXISTING star endpoint (REUSE); Move stays a
            visibly-disabled "coming soon" placeholder (no editor-side endpoint).
            Each icon carries a visible hover/focus Tooltip (S5-2) on top of its
            aria-label / native title. */}
        <Tooltip label={starred ? 'Unstar' : 'Star'} placement="bottom">
          <button
            type="button"
            className="parchment-titlebar-iconbtn"
            aria-pressed={starred}
            aria-label={starred ? 'Unstar' : 'Star'}
            title={starred ? 'Unstar' : 'Star'}
            onClick={toggleStar}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              {starred ? 'star' : 'star_border'}
            </span>
          </button>
        </Tooltip>
        <Tooltip label="Move (coming soon)" placement="bottom">
          <button
            type="button"
            className="parchment-titlebar-iconbtn"
            aria-label="Move (coming soon)"
            aria-disabled
            disabled
            title="Move (coming soon)"
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              drive_file_move
            </span>
          </button>
        </Tooltip>

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

        <Tooltip label="Comments" placement="bottom">
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
        </Tooltip>
        <Tooltip label="Version history" placement="bottom">
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
        </Tooltip>

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
