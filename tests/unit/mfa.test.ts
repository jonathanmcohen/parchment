import { describe, expect, it } from 'vitest'
import {
  countMatchingRecoveryHash,
  formatRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  RECOVERY_CODE_RE,
  timingSafeEqualStr,
  totpUri,
  verifyTotp,
} from '@/lib/auth/mfa'

// A fixed instant so the TOTP window is deterministic across runs.
const NOW = 1_700_000_000_000
const PERIOD_MS = 30_000

// Produce the valid token for a secret at a given instant via the same library
// path the implementation uses, so the test is self-checking rather than
// hard-coding a magic 6-digit string.
async function tokenAt(secret: string, atMs: number): Promise<string> {
  const { TOTP, Secret } = await import('otpauth')
  const totp = new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 })
  return totp.generate({ timestamp: atMs })
}

describe('generateTotpSecret', () => {
  it('returns a non-empty base32 string', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]+$/)
    expect(secret.length).toBeGreaterThanOrEqual(16)
  })

  it('returns a different secret each call', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret())
  })
})

describe('totpUri', () => {
  it('contains the issuer, account name, and secret', () => {
    const secret = generateTotpSecret()
    const uri = totpUri(secret, 'owner@example.com')
    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(uri).toContain(`secret=${secret}`)
    expect(uri).toContain('issuer=Parchment')
    expect(decodeURIComponent(uri)).toContain('owner@example.com')
  })

  it('honors a custom issuer', () => {
    const uri = totpUri(generateTotpSecret(), 'a@b.com', 'Acme')
    expect(uri).toContain('issuer=Acme')
  })
})

describe('verifyTotp', () => {
  it('accepts a freshly-generated token at a fixed instant', async () => {
    const secret = generateTotpSecret()
    const token = await tokenAt(secret, NOW)
    expect(verifyTotp(secret, token, NOW)).toBe(true)
  })

  it('rejects a wrong token', () => {
    const secret = generateTotpSecret()
    expect(verifyTotp(secret, '000000', NOW)).toBe(false)
  })

  it('rejects a token generated from a different secret', async () => {
    const secretA = generateTotpSecret()
    const secretB = generateTotpSecret()
    const tokenForB = await tokenAt(secretB, NOW)
    expect(verifyTotp(secretA, tokenForB, NOW)).toBe(false)
  })

  it('accepts a token from the adjacent window (±1)', async () => {
    const secret = generateTotpSecret()
    const prev = await tokenAt(secret, NOW - PERIOD_MS)
    const next = await tokenAt(secret, NOW + PERIOD_MS)
    expect(verifyTotp(secret, prev, NOW)).toBe(true)
    expect(verifyTotp(secret, next, NOW)).toBe(true)
  })

  it('rejects a token two windows away (±2)', async () => {
    const secret = generateTotpSecret()
    const twoBack = await tokenAt(secret, NOW - 2 * PERIOD_MS)
    const twoFwd = await tokenAt(secret, NOW + 2 * PERIOD_MS)
    expect(verifyTotp(secret, twoBack, NOW)).toBe(false)
    expect(verifyTotp(secret, twoFwd, NOW)).toBe(false)
  })

  it('rejects non-6-digit input without consulting the secret', () => {
    const secret = generateTotpSecret()
    expect(verifyTotp(secret, '12345', NOW)).toBe(false)
    expect(verifyTotp(secret, '1234567', NOW)).toBe(false)
    expect(verifyTotp(secret, 'abcdef', NOW)).toBe(false)
    expect(verifyTotp(secret, '', NOW)).toBe(false)
    expect(verifyTotp(secret, '12 456', NOW)).toBe(false)
  })

  it('tolerates surrounding whitespace in the submitted token', async () => {
    const secret = generateTotpSecret()
    const token = await tokenAt(secret, NOW)
    expect(verifyTotp(secret, `  ${token} `, NOW)).toBe(true)
  })
})

describe('generateRecoveryCodes', () => {
  it('returns n unique, well-formed codes', () => {
    const codes = generateRecoveryCodes(10)
    expect(codes).toHaveLength(10)
    for (const code of codes) {
      expect(code).toMatch(RECOVERY_CODE_RE)
    }
    expect(new Set(codes).size).toBe(10)
  })

  it('honors a custom count', () => {
    expect(generateRecoveryCodes(3)).toHaveLength(3)
  })
})

describe('formatRecoveryCode', () => {
  it('lowercases and strips separators/whitespace for comparison', () => {
    expect(formatRecoveryCode('  ABcd-EF12 ')).toBe('abcdef12')
    expect(formatRecoveryCode('abcd ef12')).toBe('abcdef12')
  })
})

describe('timingSafeEqualStr', () => {
  it('returns true for equal strings and false otherwise', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true)
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false)
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false)
  })
})

describe('countMatchingRecoveryHash', () => {
  it('returns -1 when no verifier matches and the matching index otherwise', async () => {
    // Pretend the second hash matches by using an identity verifier.
    const hashes = ['h0', 'h1', 'h2']
    const idx = await countMatchingRecoveryHash(hashes, 'h1', async (hash, plain) => hash === plain)
    expect(idx).toBe(1)
    const miss = await countMatchingRecoveryHash(hashes, 'zz', async (hash, plain) => hash === plain)
    expect(miss).toBe(-1)
  })
})
