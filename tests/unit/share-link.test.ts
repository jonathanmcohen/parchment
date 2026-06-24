import { describe, expect, it } from 'vitest'
import { isShareActive, pickActiveShare, type ShareLinkRow } from '@/lib/docs/share-link'

// F9: pure helpers driving the Restricted ⇄ "Anyone with the link" toggle in the
// share dialog. The link model (G1): a share row's existence == "anyone with the
// link" ON; revoking deletes the row. A share that is expired no longer grants
// access, so it must NOT count as an active public link. No DB here.

const base = (over: Partial<ShareLinkRow>): ShareLinkRow => ({
  id: 'a',
  token: 'tok-a',
  permission: 'view',
  hasPassword: false,
  expiresAt: null,
  createdAt: '2026-06-20T00:00:00.000Z',
  url: 'https://example.com/share/tok-a',
  ...over,
})

describe('F9 — isShareActive', () => {
  const now = new Date('2026-06-24T12:00:00Z')

  it('a never-expiring share is active', () => {
    expect(isShareActive(base({ expiresAt: null }), now)).toBe(true)
  })

  it('a future-expiry share is active', () => {
    expect(isShareActive(base({ expiresAt: '2030-01-01T00:00:00.000Z' }), now)).toBe(true)
  })

  it('an expired share is NOT active', () => {
    expect(isShareActive(base({ expiresAt: '2026-06-24T11:59:59.000Z' }), now)).toBe(false)
    expect(isShareActive(base({ expiresAt: '2020-01-01T00:00:00.000Z' }), now)).toBe(false)
  })
})

describe('F9 — pickActiveShare', () => {
  const now = new Date('2026-06-24T12:00:00Z')

  it('returns null for an empty list (Restricted)', () => {
    expect(pickActiveShare([], now)).toBeNull()
  })

  it('returns null when every share is expired (Restricted)', () => {
    const rows = [
      base({ id: 'a', expiresAt: '2026-06-24T11:00:00.000Z' }),
      base({ id: 'b', expiresAt: '2020-01-01T00:00:00.000Z' }),
    ]
    expect(pickActiveShare(rows, now)).toBeNull()
  })

  it('returns the single active share (Anyone with the link)', () => {
    const row = base({ id: 'a', expiresAt: null })
    expect(pickActiveShare([row], now)?.id).toBe('a')
  })

  it('prefers the newest active share when several exist (no duplicate creation)', () => {
    const rows = [
      base({ id: 'old', createdAt: '2026-06-20T00:00:00.000Z' }),
      base({ id: 'new', createdAt: '2026-06-23T00:00:00.000Z' }),
    ]
    expect(pickActiveShare(rows, now)?.id).toBe('new')
  })

  it('skips an expired newer share in favour of an active older one', () => {
    const rows = [
      base({
        id: 'expired-new',
        createdAt: '2026-06-23T00:00:00.000Z',
        expiresAt: '2026-06-24T00:00:00.000Z',
      }),
      base({ id: 'active-old', createdAt: '2026-06-20T00:00:00.000Z', expiresAt: null }),
    ]
    expect(pickActiveShare(rows, now)?.id).toBe('active-old')
  })
})
