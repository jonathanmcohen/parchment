'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { type GithubRef, githubWebUrl } from '@/lib/integrations/github'

/**
 * J6: GithubEmbedView — renders a GitHub PR / issue card with LIVE status.
 *
 * SECURITY / DEGRADATION INVARIANTS:
 *   - The plain github.com link is ALWAYS present (built from the node's
 *     validated owner/repo/number via githubWebUrl). The card therefore NEVER
 *     renders blank: while loading, when the API is unavailable (offline /
 *     rate-limited / 404), and on the empty/just-inserted state, the link (or a
 *     configure button) is shown. Live status only *enriches* this baseline.
 *   - Title and author come from GitHub and are rendered as TEXT — React escapes
 *     them. NO dangerouslySetInnerHTML anywhere.
 *   - This component imports NO `@/db` and never reads GITHUB_TOKEN. It only
 *     calls `/api/github/status?url=` (server-side fetch + token live there).
 *   - The `?url=` sent is the canonical github.com web URL rebuilt from the
 *     node's own attrs — not arbitrary user text — so the server re-validates a
 *     well-formed github.com URL (defense in depth; the route re-parses anyway).
 *
 * Reads ONLY its own attrs, so plain NodeViewProps suffice (no useEditorState —
 * the G7 lesson).
 */

type CardStatus = {
  title: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  author: string
  htmlUrl: string
  kind: 'pr' | 'issue'
}

type FetchState =
  | { phase: 'loading' }
  | { phase: 'ready'; status: CardStatus }
  | { phase: 'unavailable' }

// Badge palette per state. Plain inline styles keep the NodeView dependency-light
// and consistent with the other embed NodeViews in this codebase.
const BADGE: Record<CardStatus['state'], { bg: string; fg: string; label: string }> = {
  open: { bg: '#dafbe1', fg: '#1a7f37', label: 'Open' },
  closed: { bg: '#ffebe9', fg: '#cf222e', label: 'Closed' },
  merged: { bg: '#fbefff', fg: '#8250df', label: 'Merged' },
  draft: { bg: '#eaeef2', fg: '#57606a', label: 'Draft' },
}

function refFromAttrs(attrs: Record<string, unknown>): GithubRef | null {
  const owner = typeof attrs.owner === 'string' ? attrs.owner : ''
  const repo = typeof attrs.repo === 'string' ? attrs.repo : ''
  const number = typeof attrs.number === 'number' ? attrs.number : 0
  const kind = attrs.kind === 'pr' ? 'pr' : 'issue'
  if (!owner || !repo || !Number.isInteger(number) || number <= 0) return null
  return { owner, repo, number, kind }
}

export function GithubEmbedView({ node, getPos, editor }: NodeViewProps) {
  const ref = refFromAttrs(node.attrs)
  const storedTitle = typeof node.attrs.title === 'string' ? node.attrs.title : ''
  const webUrl = ref ? githubWebUrl(ref) : ''
  const [fetchState, setFetchState] = useState<FetchState>({ phase: 'loading' })

  useEffect(() => {
    if (!webUrl) return
    let cancelled = false
    setFetchState({ phase: 'loading' })
    fetch(`/api/github/status?url=${encodeURIComponent(webUrl)}`, {
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) return null
        return (await res.json()) as Record<string, unknown>
      })
      .then((json) => {
        if (cancelled) return
        if (
          json &&
          json.unavailable !== true &&
          typeof json.title === 'string' &&
          typeof json.state === 'string'
        ) {
          const state =
            json.state === 'closed' || json.state === 'merged' || json.state === 'draft'
              ? json.state
              : 'open'
          setFetchState({
            phase: 'ready',
            status: {
              title: json.title,
              state,
              author: typeof json.author === 'string' ? json.author : '',
              htmlUrl:
                typeof json.htmlUrl === 'string' && /^https?:/i.test(json.htmlUrl)
                  ? json.htmlUrl
                  : webUrl,
              kind: json.kind === 'pr' ? 'pr' : 'issue',
            },
          })
        } else {
          setFetchState({ phase: 'unavailable' })
        }
      })
      .catch(() => {
        if (!cancelled) setFetchState({ phase: 'unavailable' })
      })
    return () => {
      cancelled = true
    }
  }, [webUrl])

  const openEditor = () => {
    if (typeof getPos !== 'function') return
    const pos = getPos()
    if (pos === undefined) return
    editor.view.dom.dispatchEvent(
      new CustomEvent('parchment:edit-github-embed', {
        bubbles: true,
        detail: {
          pos,
          owner: ref?.owner ?? '',
          repo: ref?.repo ?? '',
          number: ref?.number ?? 0,
          kind: ref?.kind ?? 'issue',
          title: storedTitle,
        },
      }),
    )
  }

  // ── Empty (just inserted, no ref yet) ──────────────────────────────────────
  if (!ref) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <button
          type="button"
          onClick={openEditor}
          style={{
            display: 'block',
            width: '100%',
            padding: '2rem',
            textAlign: 'center',
            cursor: 'pointer',
            border: '2px dashed var(--page-border)',
            borderRadius: '6px',
            background: 'none',
            color: 'var(--page-ink-muted)',
          }}
        >
          Empty GitHub embed — click to add a PR or issue URL
        </button>
      </NodeViewWrapper>
    )
  }

  const repoSlug = `${ref.owner}/${ref.repo}#${ref.number}`
  const kindLabel = ref.kind === 'pr' ? 'Pull request' : 'Issue'
  const ready = fetchState.phase === 'ready' ? fetchState.status : null
  const badge = ready ? BADGE[ready.state] : null
  // Title precedence: live API title → stored title → the repo#number slug.
  const cardTitle = ready?.title || storedTitle || repoSlug
  const linkHref = ready?.htmlUrl || webUrl

  return (
    <NodeViewWrapper contentEditable={false}>
      <figure
        // The card is a labelled figure; the live region announces status changes.
        aria-label={`GitHub ${kindLabel} ${repoSlug}`}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem',
          margin: 0,
          padding: '0.85rem 1rem',
          border: '1px solid var(--page-border)',
          borderRadius: '6px',
          background: 'var(--page-surface-muted)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
              marginBottom: '0.25rem',
            }}
          >
            <span style={{ fontSize: '0.72rem', color: 'var(--page-ink-muted)', fontWeight: 600 }}>
              {kindLabel}
            </span>
            {/* State badge — only when live status resolved. role=status so the
                badge text is announced when it arrives. */}
            <span role="status" aria-live="polite">
              {badge ? (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.05rem 0.5rem',
                    borderRadius: '999px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    background: badge.bg,
                    color: badge.fg,
                  }}
                >
                  {badge.label}
                </span>
              ) : fetchState.phase === 'loading' ? (
                <span style={{ fontSize: '0.72rem', color: 'var(--page-ink-muted)' }}>
                  Loading status…
                </span>
              ) : (
                <span style={{ fontSize: '0.72rem', color: 'var(--page-ink-muted)' }}>
                  Status unavailable
                </span>
              )}
            </span>
          </div>

          {/* Title — TEXT (React escapes), links to the github.com page. The
              link is ALWAYS present so the card degrades to a plain link. */}
          <a
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              fontWeight: 600,
              fontSize: '0.92rem',
              color: 'var(--info)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cardTitle}
          </a>

          <div style={{ fontSize: '0.75rem', color: 'var(--page-ink-muted)', marginTop: '0.2rem' }}>
            <span>{repoSlug}</span>
            {ready?.author ? <span>{` · by ${ready.author}`}</span> : null}
          </div>
        </div>

        <button
          type="button"
          onClick={openEditor}
          aria-label="Edit GitHub embed"
          style={{
            flexShrink: 0,
            border: '1px solid var(--page-border)',
            borderRadius: '4px',
            background: 'var(--page-bg)',
            cursor: 'pointer',
            padding: '0.2rem 0.6rem',
            fontSize: '0.75rem',
            color: 'var(--page-ink-muted)',
          }}
        >
          Edit
        </button>
      </figure>
    </NodeViewWrapper>
  )
}
