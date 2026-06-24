'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseMentions } from '@/lib/docs/comments-shared'
import { OPEN_COMMENT_COMPOSER_EVENT } from '@/lib/editor/comment-events'

// ── Types ──────────────────────────────────────────────────────────────────

type CommentRow = {
  id: string
  docId: string
  threadId: string
  authorId: string | null
  body: string
  mentions: unknown
  anchorFrom: number | null
  anchorTo: number | null
  resolved: boolean
  createdAt: string
}

type Filter = 'open' | 'resolved' | 'mine'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function renderBody(body: string) {
  // Emphasize @mentions inline. Use the part content as key since @tokens
  // are unique within a split pattern and plain-text spans don't need dedup.
  const parts = body.split(/(@\w+)/g)
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: split parts have no stable id; index is safe here
      <em key={i} style={{ color: 'var(--accent)', fontStyle: 'normal', fontWeight: 600 }}>
        {part}
      </em>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: split parts have no stable id; index is safe here
      <span key={i}>{part}</span>
    ),
  )
}

// ── CommentsSidebar ────────────────────────────────────────────────────────

interface Props {
  docId: string
  editor: Editor
  currentUserId?: string
}

export function CommentsSidebar({ docId, editor, currentUserId }: Props) {
  const [comments, setComments] = useState<CommentRow[]>([])
  const [filter, setFilter] = useState<Filter>('open')
  const [focusedThreadId, setFocusedThreadId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState<Record<string, string>>({})
  const [composerBody, setComposerBody] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  // J5: the doc's per-doc inbound email address — null unless email-in is
  // configured server-side (the GET route returns { address: null } then).
  const [inboundAddress, setInboundAddress] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const focusRefs = useRef<Record<string, HTMLElement | null>>({})

  // ── Load comments ─────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/docs/${docId}/comments`)
      if (!res.ok) return
      const rows = (await res.json()) as CommentRow[]
      setComments(rows)
    } catch {
      // swallow — sidebar is non-critical
    }
  }, [docId])

  useEffect(() => {
    void load()
  }, [load])

  // ── Load the per-doc inbound email address (J5) ───────────────────────────

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const res = await fetch(`/api/docs/${docId}/inbound-address`)
        if (!res.ok) return
        const data = (await res.json()) as { address: string | null }
        if (active) setInboundAddress(data.address ?? null)
      } catch {
        // swallow — the address row is non-critical and simply hides on failure
      }
    })()
    return () => {
      active = false
    }
  }, [docId])

  const handleCopyAddress = useCallback(async () => {
    if (!inboundAddress) return
    try {
      await navigator.clipboard.writeText(inboundAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard may be unavailable (insecure context) — no-op
    }
  }, [inboundAddress])

  // ── Focus thread via DOM event ─────────────────────────────────────────

  useEffect(() => {
    const dom = editor.view.dom
    const handler = (e: Event) => {
      const threadId = (e as CustomEvent<{ threadId: string }>).detail?.threadId
      if (threadId) {
        setFocusedThreadId(threadId)
        // Scroll the thread card into view
        requestAnimationFrame(() => {
          focusRefs.current[threadId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          focusRefs.current[threadId]?.focus()
        })
      }
    }
    dom.addEventListener('parchment:focus-comment', handler)
    return () => dom.removeEventListener('parchment:focus-comment', handler)
  }, [editor])

  // ── F3: open the composer on the toolbar "Add comment" signal ──────────────
  // The toolbar button (via Editor.handleAddComment) opens this sidebar and
  // dispatches OPEN_COMMENT_COMPOSER_EVENT. We just open the composer — the
  // existing handleAddComment below reads the live selection and anchors the
  // comment, so no comment-create logic is duplicated.
  useEffect(() => {
    const dom = editor.view.dom
    const handler = () => {
      setComposerOpen(true)
      // Focus the textarea once it renders.
      requestAnimationFrame(() => {
        const ta = dom
          .closest('body')
          ?.querySelector<HTMLTextAreaElement>('textarea[aria-label="New comment body"]')
        ta?.focus()
      })
    }
    dom.addEventListener(OPEN_COMMENT_COMPOSER_EVENT, handler)
    return () => dom.removeEventListener(OPEN_COMMENT_COMPOSER_EVENT, handler)
  }, [editor])

  // ── Create thread ─────────────────────────────────────────────────────

  const handleAddComment = useCallback(async () => {
    const body = composerBody.trim()
    if (!body) return
    const { from, to } = editor.state.selection
    const hasSelection = from !== to

    setLoading(true)
    try {
      const res = await fetch(`/api/docs/${docId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          body,
          ...(hasSelection ? { anchorFrom: from, anchorTo: to } : {}),
          mentions: parseMentions(body),
        }),
      })
      if (res.ok) {
        const result = (await res.json()) as { id: string; threadId: string }
        // Apply comment mark over the current selection
        if (hasSelection) {
          editor.commands.setCommentThread(result.threadId)
        }
        setComposerBody('')
        setComposerOpen(false)
        await load()
        setFocusedThreadId(result.threadId)
      }
    } finally {
      setLoading(false)
    }
  }, [composerBody, docId, editor, load])

  // ── Reply ─────────────────────────────────────────────────────────────

  const handleReply = useCallback(
    async (threadId: string) => {
      const body = (replyBody[threadId] ?? '').trim()
      if (!body) return
      setLoading(true)
      try {
        const res = await fetch(`/api/docs/${docId}/comments`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body, threadId, mentions: parseMentions(body) }),
        })
        if (res.ok) {
          setReplyBody((prev) => ({ ...prev, [threadId]: '' }))
          await load()
        }
      } finally {
        setLoading(false)
      }
    },
    [docId, load, replyBody],
  )

  // ── Resolve / reopen ──────────────────────────────────────────────────

  const handleSetResolved = useCallback(
    async (threadId: string, resolved: boolean) => {
      await fetch(`/api/docs/${docId}/comments/${threadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolved }),
      })
      await load()
      // Unset mark if resolving
      if (resolved) {
        editor.commands.unsetCommentThread(threadId)
      }
    },
    [docId, editor, load],
  )

  // ── Derive threads ────────────────────────────────────────────────────

  // Group comments by threadId; root = comment where id === threadId
  const threadMap = new Map<string, CommentRow[]>()
  for (const c of comments) {
    const arr = threadMap.get(c.threadId) ?? []
    arr.push(c)
    threadMap.set(c.threadId, arr)
  }

  // Root comments (id === threadId) define thread order
  const roots = comments.filter((c) => c.id === c.threadId)

  const filteredRoots = roots.filter((root) => {
    if (filter === 'open') return !root.resolved
    if (filter === 'resolved') return root.resolved
    if (filter === 'mine') return root.authorId === currentUserId
    return true
  })

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <aside
      aria-label="Comments"
      style={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border, #e5e7eb)',
        background: 'var(--surface, #fff)',
        overflowY: 'auto',
        padding: '8px 0',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px 8px',
          borderBottom: '1px solid var(--border, #e5e7eb)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>Comments</span>
        <button
          type="button"
          aria-label="Add comment"
          title="Add comment on selection"
          onClick={() => setComposerOpen((v) => !v)}
          style={{
            fontSize: 18,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            lineHeight: 1,
            padding: '2px 4px',
          }}
        >
          +
        </button>
      </div>

      {/* J5: Email-to-comment address — shown ONLY when email-in is configured */}
      {inboundAddress && (
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--border, #e5e7eb)',
            fontSize: 11,
            color: 'var(--muted, #6b7280)',
          }}
        >
          <div style={{ marginBottom: 4 }}>Email to comment:</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <code
              style={{
                flex: 1,
                fontSize: 11,
                wordBreak: 'break-all',
                color: 'var(--text, #111827)',
                background: 'var(--surface-hover, #F8F9FA)',
                padding: '2px 4px',
                borderRadius: 4,
              }}
            >
              {inboundAddress}
            </code>
            <button
              type="button"
              aria-label="Copy email-to-comment address"
              onClick={() => void handleCopyAddress()}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: 4,
                background: 'transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Composer */}
      {composerOpen && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
          <textarea
            aria-label="New comment body"
            placeholder="Add a comment… (@mention to notify)"
            rows={3}
            value={composerBody}
            onChange={(e) => setComposerBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void handleAddComment()
              }
            }}
            style={{ width: '100%', resize: 'vertical', fontSize: 13, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button
              type="button"
              disabled={loading || composerBody.trim().length === 0}
              onClick={() => void handleAddComment()}
              style={{ fontSize: 12 }}
            >
              Comment
            </button>
            <button
              type="button"
              onClick={() => {
                setComposerOpen(false)
                setComposerBody('')
              }}
              style={{ fontSize: 12 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <fieldset
        aria-label="Filter comments"
        style={{
          display: 'flex',
          gap: 4,
          padding: '6px 12px',
          borderBottom: '1px solid var(--border, #e5e7eb)',
          border: 'none',
          margin: 0,
        }}
      >
        {(['open', 'resolved', 'mine'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 4,
              border: '1px solid var(--border, #e5e7eb)',
              background: filter === f ? 'var(--accent)' : 'transparent',
              color: filter === f ? 'var(--accent-contrast, #fff)' : 'inherit',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f}
          </button>
        ))}
      </fieldset>

      {/* Thread list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredRoots.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted, #6b7280)', padding: '12px', margin: 0 }}>
            No comments.
          </p>
        ) : (
          filteredRoots.map((root) => {
            const replies = (threadMap.get(root.threadId) ?? []).filter((c) => c.id !== c.threadId)
            const isFocused = focusedThreadId === root.threadId

            return (
              <article
                key={root.threadId}
                ref={(el) => {
                  focusRefs.current[root.threadId] = el
                }}
                aria-label="Comment thread"
                onClick={() => setFocusedThreadId(root.threadId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setFocusedThreadId(root.threadId)
                }}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border, #e5e7eb)',
                  background: isFocused ? 'var(--surface-hover, #F8F9FA)' : 'transparent',
                  cursor: 'pointer',
                  outline: isFocused ? '2px solid var(--accent)' : 'none',
                  outlineOffset: -2,
                }}
              >
                {/* Root comment */}
                <CommentCard comment={root} />

                {/* Replies */}
                {replies.map((r) => (
                  <div key={r.id} style={{ marginTop: 6, paddingLeft: 12 }}>
                    <CommentCard comment={r} />
                  </div>
                ))}

                {/* Resolve / Reopen */}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    aria-label={root.resolved ? 'Reopen thread' : 'Resolve thread'}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleSetResolved(root.threadId, !root.resolved)
                    }}
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      border: '1px solid var(--border, #e5e7eb)',
                      borderRadius: 4,
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {root.resolved ? 'Reopen' : 'Resolve'}
                  </button>
                </div>

                {/* Reply input */}
                {!root.resolved && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      aria-label="Reply to thread"
                      placeholder="Reply… (@mention)"
                      value={replyBody[root.threadId] ?? ''}
                      onChange={(e) =>
                        setReplyBody((prev) => ({ ...prev, [root.threadId]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void handleReply(root.threadId)
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '100%', fontSize: 12, boxSizing: 'border-box' }}
                    />
                  </div>
                )}
              </article>
            )
          })
        )}
      </div>
    </aside>
  )
}

// ── CommentCard ────────────────────────────────────────────────────────────

function CommentCard({ comment }: { comment: CommentRow }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>
          {comment.authorId ? `User ${comment.authorId.slice(0, 6)}` : 'Anonymous'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted, #6b7280)' }}>
          {formatTime(comment.createdAt)}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }}>{renderBody(comment.body)}</p>
    </div>
  )
}
