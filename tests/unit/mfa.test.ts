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
  verifyTotpStep,
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
  it('returns n unique codes that normalize to 16 base32 chars (80-bit)', () => {
    const codes = generateRecoveryCodes(10)
    expect(codes).toHaveLength(10)
    for (const code of codes) {
      // Displayed grouped (four 4-char blocks); normalizes to the 16-char form.
      const normalized = formatRecoveryCode(code)
      expect(normalized).toMatch(RECOVERY_CODE_RE)
      expect(normalized).toHaveLength(16)
    }
    expect(new Set(codes).size).toBe(10)
  })

  it('honors a custom count', () => {
    expect(generateRecoveryCodes(3)).toHaveLength(3)
  })
})

describe('formatRecoveryCode', () => {
  it('lowercases and strips separators/whitespace for comparison', () => {
    expect(formatRecoveryCode('  A3KF-9P2M ')).toBe('a3kf9p2m')
    expect(formatRecoveryCode('a3kf 9p2m')).toBe('a3kf9p2m')
  })

  it('folds Crockford-ambiguous characters (O→0, I/L→1) so paper typos match', () => {
    expect(formatRecoveryCode('OIL0')).toBe('0110')
  })
})

describe('verifyTotpStep', () => {
  it('returns the absolute time-step a valid token matched', async () => {
    const secret = generateTotpSecret()
    const token = await tokenAt(secret, NOW)
    const step = verifyTotpStep(secret, token, NOW)
    expect(step).toBe(Math.floor(NOW / 1000 / 30))
  })

  it('returns the prior/next step for the ±1 window, distinct from the current', async () => {
    const secret = generateTotpSecret()
    const current = Math.floor(NOW / 1000 / 30)
    const prev = await tokenAt(secret, NOW - PERIOD_MS)
    const next = await tokenAt(secret, NOW + PERIOD_MS)
    expect(verifyTotpStep(secret, prev, NOW)).toBe(current - 1)
    expect(verifyTotpStep(secret, next, NOW)).toBe(current + 1)
  })

  it('returns null for a wrong or malformed token', () => {
    const secret = generateTotpSecret()
    expect(verifyTotpStep(secret, '000000', NOW)).toBeNull()
    expect(verifyTotpStep(secret, '12345', NOW)).toBeNull()
  })

  it('a replayed code maps to the same step (so the DB watermark rejects reuse)', async () => {
    // The route persists the matched step and rejects steps <= the stored one.
    // Two verifications of the same live code at the same instant yield the SAME
    // step, which is how the watermark detects the replay.
    const secret = generateTotpSecret()
    const token = await tokenAt(secret, NOW)
    const first = verifyTotpStep(secret, token, NOW)
    const second = verifyTotpStep(secret, token, NOW + 5_000)
    expect(first).not.toBeNull()
    expect(second).toBe(first)
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
    const miss = await countMatchingRecoveryHash(
      hashes,
      'zz',
      async (hash, plain) => hash === plain,
    )
    expect(miss).toBe(-1)
  })
})
