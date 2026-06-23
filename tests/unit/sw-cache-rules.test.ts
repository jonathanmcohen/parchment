import { describe, expect, it } from 'vitest'
import { swStrategyFor } from '@/lib/sw-strategy'

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
    // icons, manifest, etc.
    expect(swStrategyFor(`${ORIGIN}/icons/icon-192.png`, 'GET', 'cors', ORIGIN)).toBe('swr')
    expect(swStrategyFor(`${ORIGIN}/manifest.webmanifest`, 'GET', 'same-origin', ORIGIN)).toBe(
      'swr',
    )
  })
})
