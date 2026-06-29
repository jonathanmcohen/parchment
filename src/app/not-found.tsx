'use client'

// F6: Parchment-styled 404. Lives at the app root (sibling to layout.tsx) so
// Next renders it through the root layout — NOT the auth-gated (app) shell — for
// any unmatched route, replacing Next's bare default 404.
//
// All colors come from S1 tokens (var(--…)); there is intentionally ZERO
// hardcoded hex in this file (grep-clean per the brief). The recovery search
// reuses GET /api/search as-is — no new backend. That route is authenticated, so
// the input is auth-gated: a 401 response flips the box to a "Sign in to search"
// hint (a link to /login) rather than leaving a dead box that keeps 401-ing.
//
// v0.2.2: this page renders through the ROOT layout, which (unlike the (app)
// shell) sets NO data-color-scheme — so the page used to paint with the light
// :root tokens even when the OS / workspace is dark. We can't read the per-owner
// workspace theme here (404 may be unauthenticated, and a DB call in the error
// path is fragile), so the wrapper opts into data-color-scheme="system": the
// tokens.css `@media (prefers-color-scheme: dark) [data-color-scheme="system"]`
// block + the `:root:has([data-color-scheme="system"])` rule then resolve every
// --background/--foreground/--primary token to the OS-preferred scheme. No
// hardcoded hex, no new JS.
//
// This is a client component because the recovery search is interactive
// (debounced fetch). It imports only the framework-free helpers in
// '@/lib/search/recovery' — never '@/db' — so no server/DB code reaches the
// client bundle.

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildRecoverySearchUrl,
  interpretRecoveryResponse,
  type RecoveryResult,
  type RecoverySearchBody,
  type RecoverySearchState,
  recoveryResultHref,
} from '@/lib/search/recovery'

export default function NotFound() {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<RecoverySearchState>({ status: 'ok', results: [] })
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Monotonic request stamp — guards against out-of-order search responses.
  const reqSeqRef = useRef(0)

  const runSearch = useCallback(async (q: string) => {
    const url = buildRecoverySearchUrl(q)
    if (!url) {
      setState({ status: 'ok', results: [] })
      setSearching(false)
      return
    }
    // Request-ordering guard: stamp each request; ignore a response if a newer
    // request has since been issued (a slow earlier fetch must not overwrite a
    // faster later one with stale results).
    reqSeqRef.current += 1
    const seq = reqSeqRef.current
    try {
      const res = await fetch(url)
      let body: RecoverySearchBody | null = null
      try {
        body = (await res.json()) as RecoverySearchBody
      } catch {
        body = null
      }
      if (seq !== reqSeqRef.current) return
      setState(interpretRecoveryResponse(res.status, body))
    } catch {
      if (seq !== reqSeqRef.current) return
      setState({ status: 'error' })
    } finally {
      if (seq === reqSeqRef.current) setSearching(false)
    }
  }, [])

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    setSearching(Boolean(q.trim()))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void runSearch(q)
    }, 200)
  }

  // Clear any pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const unauthenticated = state.status === 'unauthenticated'
  const results: RecoveryResult[] = state.status === 'ok' ? state.results : []
  const trimmed = query.trim()

  return (
    <div
      // Opt this out-of-shell page into the system color scheme so tokens.css
      // resolves dark/light from the OS (the root layout sets no scheme).
      data-color-scheme="system"
      style={{ minHeight: '100dvh', background: 'var(--background)' }}
    >
      <main
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          padding: '2rem 1.25rem',
          textAlign: 'center',
          background: 'var(--background)',
          color: 'var(--foreground)',
        }}
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
        >
          <p
            aria-hidden="true"
            style={{
              margin: 0,
              fontSize: 'clamp(4rem, 18vw, 7rem)',
              fontWeight: 700,
              lineHeight: 1,
              color: 'var(--primary)',
            }}
          >
            404
          </p>
          <h1
            style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600, color: 'var(--foreground)' }}
          >
            This page wandered off
          </h1>
          <p style={{ margin: 0, maxWidth: '34rem', fontSize: '1rem', color: 'var(--muted)' }}>
            We couldn&rsquo;t find the page you were looking for. It may have been moved, deleted,
            or never existed.
          </p>
        </div>

        <Link href="/files" className="parchment-titlebar-share" style={{ textDecoration: 'none' }}>
          <span aria-hidden="true" className="material-symbols-rounded text-[16px]">
            home
          </span>
          Back to home
        </Link>

        <section
          aria-label="Search for a document"
          style={{
            width: '100%',
            maxWidth: '34rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            marginTop: '0.5rem',
          }}
        >
          {unauthenticated ? (
            <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--muted)' }}>
              <Link href="/login" style={{ color: 'var(--link)' }}>
                Sign in to search
              </Link>{' '}
              your documents.
            </p>
          ) : (
            <>
              <label
                htmlFor="recovery-search"
                style={{
                  textAlign: 'start',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--foreground)',
                }}
              >
                Looking for something specific?
              </label>
              <input
                id="recovery-search"
                type="search"
                value={query}
                onChange={handleQueryChange}
                placeholder="Search your documents…"
                autoComplete="off"
                style={{
                  width: '100%',
                  height: '44px',
                  padding: '0 1rem',
                  borderRadius: '22px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--foreground)',
                  fontSize: '1rem',
                  outline: 'none',
                }}
              />

              {state.status === 'error' && (
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--error)' }}>
                  Something went wrong while searching. Please try again.
                </p>
              )}

              {trimmed && !searching && results.length === 0 && state.status === 'ok' && (
                <p
                  role="status"
                  aria-live="polite"
                  style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted)' }}
                >
                  No matching documents.
                </p>
              )}

              {results.length > 0 && (
                <ul
                  aria-label="Matching documents"
                  aria-live="polite"
                  aria-atomic="true"
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    textAlign: 'start',
                    border: '1px solid var(--border)',
                    borderRadius: '0.5rem',
                    overflow: 'hidden',
                    background: 'var(--surface)',
                  }}
                >
                  {results.map((result) => (
                    <li key={result.id}>
                      <Link
                        href={recoveryResultHref(result.id)}
                        style={{
                          display: 'block',
                          padding: '0.625rem 1rem',
                          textDecoration: 'none',
                          color: 'var(--foreground)',
                          borderBottom: '1px solid var(--border-chrome)',
                        }}
                      >
                        <span style={{ display: 'block', fontWeight: 500, fontSize: '0.9375rem' }}>
                          {result.title || 'Untitled'}
                        </span>
                        {result.preview && (
                          <span
                            style={{
                              display: 'block',
                              marginTop: '0.125rem',
                              fontSize: '0.8125rem',
                              color: 'var(--muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {result.preview}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
