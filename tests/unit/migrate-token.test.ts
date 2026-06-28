import { describe, expect, it } from 'vitest'
import { generateMigrateToken, hashMigrateToken, verifyMigrateToken } from '@/lib/migrate/token'

// D-T1 — migrate token generation, hashing, and constant-time verification.

describe('migrate token', () => {
  it('generateMigrateToken produces a string ≥ 40 chars', () => {
    const t = generateMigrateToken()
    expect(typeof t).toBe('string')
    expect(t.length).toBeGreaterThanOrEqual(40)
  })

  it('two calls produce different tokens', () => {
    expect(generateMigrateToken()).not.toBe(generateMigrateToken())
  })

  it('hashMigrateToken is deterministic', () => {
    const t = generateMigrateToken()
    expect(hashMigrateToken(t)).toBe(hashMigrateToken(t))
  })

  it('produces a 64-char hex hash', () => {
    const h = hashMigrateToken(generateMigrateToken())
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('verifyMigrateToken accepts the matching token', () => {
    const t = generateMigrateToken()
    expect(verifyMigrateToken(t, hashMigrateToken(t))).toBe(true)
  })

  it('verifyMigrateToken rejects a wrong token', () => {
    const t = generateMigrateToken()
    expect(verifyMigrateToken('bad-token', hashMigrateToken(t))).toBe(false)
  })

  it('verifyMigrateToken rejects when the stored hash is empty / malformed', () => {
    const t = generateMigrateToken()
    expect(verifyMigrateToken(t, '')).toBe(false)
    expect(verifyMigrateToken(t, 'not-a-hash')).toBe(false)
  })

  it('handles a length-mismatched incoming token without throwing', () => {
    // The fixed-64-hex compare must not early-exit on length mismatch.
    const t = generateMigrateToken()
    const stored = hashMigrateToken(t)
    expect(() => verifyMigrateToken('x', stored)).not.toThrow()
    expect(verifyMigrateToken('x', stored)).toBe(false)
  })
})
