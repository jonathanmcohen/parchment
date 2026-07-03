import { describe, expect, it } from 'vitest'
import { isStaleShellCache, shellCacheName, swStrategyFor } from '@/lib/sw-strategy'

const ORIGIN = 'https://app.parchment.local'

describe('swStrategyFor — SW cache-strategy classifier', () => {
  // ── network-only ──────────────────────────────────────────────────────────

  it('returns network-only for /api/* routes', () => {
    expect(swStrategyFor(`${ORIGIN}/api/docs`, 'GET', 'cors', ORIGIN)).toBe('network-only')
    expect(swStrategyFor(`${ORIGIN}/api/x`, 'GET', 'same-origin', ORIGIN)).toBe('network-only')
  })

  it('returns network-only for non-GET requests', () => {
    expect(swStrategyFor(`${ORIGIN}/d/abc123`, 'POST', 'same-origin', ORIGIN)).toBe('network-only')
    expect(swStrategyFor(`${ORIGIN}/d/abc123`, 'PUT', 'same-origin', ORIGIN)).toBe('network-only')
    expect(swStrategyFor(`${ORIGIN}/d/abc123`, 'DELETE', 'same-origin', ORIGIN)).toBe(
      'network-only',
    )
    expect(swStrategyFor(`${ORIGIN}/api/docs/x`, 'POST', 'same-origin', ORIGIN)).toBe(
      'network-only',
    )
  })

  it('returns network-only for WebSocket URLs (collab server)', () => {
    expect(swStrategyFor('ws://localhost:1234', 'GET', 'websocket', ORIGIN)).toBe('network-only')
    expect(swStrategyFor('wss://collab.example.com/ws', 'GET', 'websocket', ORIGIN)).toBe(
      'network-only',
    )
  })

  it('returns network-only for cross-origin requests', () => {
    expect(swStrategyFor('https://cdn.example.com/font.woff2', 'GET', 'cors', ORIGIN)).toBe(
      'network-only',
    )
  })

  it('returns network-only for auth endpoints', () => {
    expect(swStrategyFor(`${ORIGIN}/auth/callback`, 'GET', 'same-origin', ORIGIN)).toBe(
      'network-only',
    )
    expect(swStrategyFor(`${ORIGIN}/login`, 'GET', 'navigate', ORIGIN)).toBe('network-only')
    expect(swStrategyFor(`${ORIGIN}/logout`, 'GET', 'navigate', ORIGIN)).toBe('network-only')
  })

  // ── cache-first ───────────────────────────────────────────────────────────

  it('returns cache-first for /_next/static/ assets', () => {
    expect(swStrategyFor(`${ORIGIN}/_next/static/chunks/main.js`, 'GET', 'no-cors', ORIGIN)).toBe(
      'cache-first',
    )
    expect(swStrategyFor(`${ORIGIN}/_next/static/css/app.css`, 'GET', 'same-origin', ORIGIN)).toBe(
      'cache-first',
    )
    // Typical hashed chunk filename
    expect(
      swStrategyFor(
        `${ORIGIN}/_next/static/chunks/webpack-abc123def456.js`,
        'GET',
        'no-cors',
        ORIGIN,
      ),
    ).toBe('cache-first')
  })

  // ── network-first ─────────────────────────────────────────────────────────

  it('returns network-first for navigation requests', () => {
    expect(swStrategyFor(`${ORIGIN}/d/abc123`, 'GET', 'navigate', ORIGIN)).toBe('network-first')
    expect(swStrategyFor(`${ORIGIN}/`, 'GET', 'navigate', ORIGIN)).toBe('network-first')
    expect(swStrategyFor(`${ORIGIN}/docs`, 'GET', 'navigate', ORIGIN)).toBe('network-first')
  })

  // ── stale-while-revalidate ────────────────────────────────────────────────

  it('returns swr for other same-origin GETs', () => {
    // manifest, arbitrary same-origin GETs.
    expect(swStrategyFor(`${ORIGIN}/manifest.webmanifest`, 'GET', 'same-origin', ORIGIN)).toBe(
      'swr',
    )
    expect(swStrategyFor(`${ORIGIN}/some/other/path`, 'GET', 'cors', ORIGIN)).toBe('swr')
  })

  // ── cache-first: self-hosted fonts + PWA icons (effectively immutable) ──────

  it('returns cache-first for self-hosted /fonts/ assets', () => {
    expect(swStrategyFor(`${ORIGIN}/fonts/roboto-400.woff2`, 'GET', 'cors', ORIGIN)).toBe(
      'cache-first',
    )
    expect(
      swStrategyFor(`${ORIGIN}/fonts/material-symbols-rounded.woff2`, 'GET', 'cors', ORIGIN),
    ).toBe('cache-first')
  })

  it('returns cache-first for /icons/ PWA icons', () => {
    expect(swStrategyFor(`${ORIGIN}/icons/icon-192.png`, 'GET', 'cors', ORIGIN)).toBe('cache-first')
    expect(swStrategyFor(`${ORIGIN}/icons/icon-maskable-512.png`, 'GET', 'no-cors', ORIGIN)).toBe(
      'cache-first',
    )
  })

  it('keeps a font/icon request network-only when it is a mutation or cross-origin', () => {
    // Belt-and-suspenders: the earlier guards win over the /fonts/ path rule.
    expect(swStrategyFor(`${ORIGIN}/fonts/roboto-400.woff2`, 'POST', 'cors', ORIGIN)).toBe(
      'network-only',
    )
    expect(swStrategyFor('https://cdn.example.com/icons/x.png', 'GET', 'cors', ORIGIN)).toBe(
      'network-only',
    )
  })
})

describe('shellCacheName — version-scoped cache key', () => {
  it('derives a stable, version-scoped name', () => {
    expect(shellCacheName('0.2.10')).toBe('parchment-shell-0.2.10')
    expect(shellCacheName('1.0.0')).toBe('parchment-shell-1.0.0')
  })

  it('falls back to a "dev" suffix when the version is missing or blank', () => {
    expect(shellCacheName(null)).toBe('parchment-shell-dev')
    expect(shellCacheName(undefined)).toBe('parchment-shell-dev')
    expect(shellCacheName('')).toBe('parchment-shell-dev')
    expect(shellCacheName('   ')).toBe('parchment-shell-dev')
  })
})

describe('isStaleShellCache — activate-time cleanup predicate', () => {
  const current = shellCacheName('0.2.10')

  it('flags an older Parchment shell cache as stale', () => {
    expect(isStaleShellCache('parchment-shell-0.2.9', current)).toBe(true)
    // The legacy pre-versioned name must be swept too.
    expect(isStaleShellCache('parchment-v1', current)).toBe(true)
  })

  it('never flags the current cache', () => {
    expect(isStaleShellCache(current, current)).toBe(false)
    expect(isStaleShellCache('parchment-shell-0.2.10', 'parchment-shell-0.2.10')).toBe(false)
  })

  it('never touches caches owned by other code (only parchment-* is ours)', () => {
    expect(isStaleShellCache('workbox-precache', current)).toBe(false)
    expect(isStaleShellCache('some-other-app-cache', current)).toBe(false)
  })
})
