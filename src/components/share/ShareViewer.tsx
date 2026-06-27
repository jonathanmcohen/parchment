'use client'

import { type ReactNode, useCallback, useEffect, useId, useState } from 'react'
import { CustomCssStyle } from '@/components/editor/CustomCssStyle'
import { renderReadOnlyDoc } from '@/components/share/render-pm'
import { CUSTOM_CSS_SCOPE } from '@/lib/editor/custom-css'

// G1 public share viewer (client). Unauthenticated. On mount it POSTs the token
// (no password) to the public data path; if a password is required it shows a
// form and re-POSTs with the password. On success it renders the doc READ-ONLY
// via a safe ProseMirror-JSON → React renderer (no dangerouslySetInnerHTML, so
// owner-authored content can never inject script into the public page). When the
// stored permission is a write perm it shows a muted "view-only in v0.1" note —
// anonymous writes are an explicit v0.2 GAP. A 404 shows "link expired or invalid".

/** H2: safe-shape public comment (display data only — never authorId/email). */
type PublicComment = {
  id: string
  threadId: string
  body: string
  resolved: boolean
  createdAt: string
  anchorFrom: number | null
  anchorTo: number | null
}

type ViewerState =
  | { kind: 'loading' }
  | { kind: 'password'; wrong: boolean }
  | { kind: 'invalid' }
  | {
      kind: 'ok'
      title: string
      body: ReactNode
      permission: string
      customCss: string
      comments: PublicComment[]
    }

type ShareResponse = {
  docId: string
  title: string
  contentJson: unknown
  permission: string
  /** G17: owner's raw custom CSS — sanitized+scoped at render. */
  customCss?: unknown
  /** H2: read-only public comments (open threads only). */
  comments?: PublicComment[]
}

export function ShareViewer({ token }: { token: string }) {
  const [state, setState] = useState<ViewerState>({ kind: 'loading' })
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const pwFieldId = useId()

  const load = useCallback(
    async (pw: string | null) => {
      try {
        const res = await fetch(`/api/share/${token}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(pw === null ? {} : { password: pw }),
        })

        if (res.status === 404) {
          setState({ kind: 'invalid' })
          return
        }
        if (res.status === 401) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          setState({ kind: 'password', wrong: data.error === 'password_wrong' })
          return
        }
        if (!res.ok) {
          setState({ kind: 'invalid' })
          return
        }

        const data = (await res.json()) as ShareResponse
        setState({
          kind: 'ok',
          title: data.title,
          body: renderReadOnlyDoc(data.contentJson),
          permission: data.permission,
          customCss: typeof data.customCss === 'string' ? data.customCss : '',
          comments: Array.isArray(data.comments) ? data.comments : [],
        })
      } catch {
        setState({ kind: 'invalid' })
      }
    },
    [token],
  )

  // Initial load with no password.
  useEffect(() => {
    void load(null)
  }, [load])

  const onSubmitPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (submitting) return
      setSubmitting(true)
      setState({ kind: 'loading' })
      await load(password)
      setSubmitting(false)
    },
    [load, password, submitting],
  )

  if (state.kind === 'loading') {
    return (
      <main className="parchment-share-shell">
        <p className="parchment-share-status">Loading…</p>
      </main>
    )
  }

  if (state.kind === 'invalid') {
    return (
      <main className="parchment-share-shell">
        <div className="parchment-share-card">
          <h1 className="parchment-share-heading">Link expired or invalid</h1>
          <p className="parchment-share-status">
            This share link is no longer valid. Ask the document owner for a new link.
          </p>
        </div>
      </main>
    )
  }

  if (state.kind === 'password') {
    return (
      <main className="parchment-share-shell">
        <form className="parchment-share-card" onSubmit={onSubmitPassword}>
          <h1 className="parchment-share-heading">Password required</h1>
          <p className="parchment-share-status">This document is protected by a password.</p>
          <label htmlFor={pwFieldId} className="parchment-dialog-label">
            Password
          </label>
          <input
            id={pwFieldId}
            type="password"
            className="parchment-dialog-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {state.wrong && (
            <p className="parchment-share-error" role="alert">
              Incorrect password. Try again.
            </p>
          )}
          <button type="submit" className="parchment-dialog-btn-primary" disabled={submitting}>
            Unlock
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="parchment-share-shell">
      <article className="parchment-share-doc">
        <h1 className="parchment-share-title">{state.title}</h1>
        {/* G17: scope class wraps doc content; CustomCssStyle injects sanitized+scoped style. */}
        <div className={`parchment-prose ${CUSTOM_CSS_SCOPE}`}>
          <CustomCssStyle css={state.customCss} />
          {state.body}
        </div>
        {state.comments.length > 0 && (
          <aside className="parchment-share-comments" aria-label="Comments">
            <h2 className="parchment-share-comments-heading">Comments</h2>
            <ul className="parchment-share-comments-list">
              {state.comments.map((c) => (
                <li key={c.id} className="parchment-share-comment" data-thread-id={c.threadId}>
                  <p className="parchment-share-comment-body">{c.body}</p>
                  <time className="parchment-share-comment-time" dateTime={c.createdAt}>
                    {formatCommentTime(c.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </article>
    </main>
  )
}

function formatCommentTime(iso: string): string {
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
