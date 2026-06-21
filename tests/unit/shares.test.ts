import { describe, expect, it } from 'vitest'
import { isExpired, isWritePermission, PERMISSIONS } from '@/lib/docs/shares-repo'

// G1: pure helpers for the share repo — no DB. The argon2 + token + DB paths are
// covered by tests/integration/shares.test.ts against real Postgres.

describe('G1 — isExpired', () => {
  const now = new Date('2026-06-21T12:00:00Z')

  it('never expires when expiresAt is null', () => {
    expect(isExpired(null, now)).toBe(false)
  })

  it('is expired when expiresAt is strictly before now', () => {
    expect(isExpired(new Date('2026-06-21T11:59:59Z'), now)).toBe(true)
    expect(isExpired(new Date('2020-01-01T00:00:00Z'), now)).toBe(true)
  })

  it('is not expired when expiresAt is in the future', () => {
    expect(isExpired(new Date('2026-06-21T12:00:01Z'), now)).toBe(false)
    expect(isExpired(new Date('2030-01-01T00:00:00Z'), now)).toBe(false)
  })

  it('defaults `now` to the current time', () => {
    expect(isExpired(new Date(Date.now() - 1000))).toBe(true)
    expect(isExpired(new Date(Date.now() + 60_000))).toBe(false)
  })
})

describe('G1 — isWritePermission', () => {
  it('view is read-only', () => {
    expect(isWritePermission('view')).toBe(false)
  })

  it('comment/edit/suggest are write perms (rendered read-only in v0.1)', () => {
    expect(isWritePermission('comment')).toBe(true)
    expect(isWritePermission('edit')).toBe(true)
    expect(isWritePermission('suggest')).toBe(true)
  })

  it('unknown perms are not write perms', () => {
    expect(isWritePermission('bogus')).toBe(false)
  })
})

describe('G1 — PERMISSIONS', () => {
  it('lists the four supported permissions', () => {
    expect([...PERMISSIONS]).toEqual(['view', 'comment', 'edit', 'suggest'])
  })
})
