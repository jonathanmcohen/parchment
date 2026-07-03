'use client'

// D3: the graceful offline fallback page. The service worker serves THIS page for
// a navigation to a document (or any route) that was never visited online and so
// isn't in the cache — instead of a browser error page (flow 4c).
//
// Lives at the app root (sibling to layout.tsx / not-found.tsx) so Next renders it
// through the ROOT layout, NOT the auth-gated (app) shell: an offline navigation
// can't reach requireUser() (the server is unreachable), so it must not depend on
// auth or any DB read. Like not-found.tsx it opts into data-color-scheme="system"
// so tokens.css resolves dark/light from the OS (the root layout sets no scheme).
// ZERO hardcoded hex — every colour is a var(--…) token.
//
// A document you HAVE opened online opens fine offline (its shell is cached and
// its content hydrates from IndexedDB via the editor's y-indexeddb path); this
// page is only for content the browser has never seen.

import Link from 'next/link'

export default function OfflinePage() {
  return (
    <div
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
          <span
            aria-hidden="true"
            className="material-symbols-rounded"
            style={{ fontSize: 'clamp(3rem, 12vw, 4.5rem)', color: 'var(--primary)' }}
          >
            cloud_off
          </span>
          <h1
            style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600, color: 'var(--foreground)' }}
          >
            You&rsquo;re offline
          </h1>
          <p style={{ margin: 0, maxWidth: '34rem', fontSize: '1rem', color: 'var(--muted)' }}>
            This page hasn&rsquo;t been opened on this device yet, so it isn&rsquo;t available
            offline. Documents you&rsquo;ve already opened stay editable — your changes save locally
            and sync when you&rsquo;re back online.
          </p>
        </div>

        <div
          style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}
        >
          <button
            type="button"
            data-testid="offline-retry"
            className="parchment-titlebar-share"
            style={{ textDecoration: 'none', cursor: 'pointer' }}
            onClick={() => window.location.reload()}
          >
            <span aria-hidden="true" className="material-symbols-rounded text-[16px]">
              refresh
            </span>
            Try again
          </button>
          <Link
            href="/files"
            className="parchment-titlebar-share"
            style={{ textDecoration: 'none' }}
          >
            <span aria-hidden="true" className="material-symbols-rounded text-[16px]">
              home
            </span>
            Your documents
          </Link>
        </div>
      </main>
    </div>
  )
}
