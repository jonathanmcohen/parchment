// Phase 0 Task 1 — unit tests for src/lib/crypto/secret-box.ts (AES-256-GCM).
//
// TDD RED record: written BEFORE src/lib/crypto/secret-box.ts existed; the whole
// file failed to import (15 tests failing — "Cannot find module"). Now GREEN.
//
// Pure unit tests: no DB, no env.ts. The master key is stubbed directly into
// process.env.PARCHMENT_SECRET_KEY because secret-box reads the key at CALL time
// (so the module can be imported even when the key is absent).
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DecryptError,
  decryptSecret,
  encryptSecret,
  isMasked,
  redactSecret,
  SECRET_MASK,
} from '@/lib/crypto/secret-box'

const VALID_KEY = randomBytes(32).toString('base64')
const OTHER_KEY = randomBytes(32).toString('base64')
let savedKey: string | undefined

beforeAll(() => {
  savedKey = process.env.PARCHMENT_SECRET_KEY
  process.env.PARCHMENT_SECRET_KEY = VALID_KEY
})

afterAll(() => {
  if (savedKey === undefined) delete process.env.PARCHMENT_SECRET_KEY
  else process.env.PARCHMENT_SECRET_KEY = savedKey
})

describe('SECRET_MASK / isMasked / redactSecret', () => {
  it('SECRET_MASK is the literal ••••••••', () => {
    expect(SECRET_MASK).toBe('••••••••')
    expect(SECRET_MASK).toBe('••••••••')
    expect(SECRET_MASK).toHaveLength(8)
  })

  it('isMasked returns true for SECRET_MASK', () => {
    expect(isMasked(SECRET_MASK)).toBe(true)
  })

  it('isMasked returns false for plaintext', () => {
    expect(isMasked('hunter2')).toBe(false)
    expect(isMasked('')).toBe(false)
    expect(isMasked('•••')).toBe(false) // wrong length
  })

  it('redactSecret returns SECRET_MASK for any non-masked string', () => {
    expect(redactSecret('super-secret-value')).toBe(SECRET_MASK)
    expect(redactSecret('')).toBe(SECRET_MASK)
  })

  it('redactSecret returns SECRET_MASK unchanged for already-masked string', () => {
    expect(redactSecret(SECRET_MASK)).toBe(SECRET_MASK)
  })
})

describe('encryptSecret / decryptSecret — happy path', () => {
  it('round-trips a short string', () => {
    const plain = 'hunter2'
    expect(decryptSecret(encryptSecret(plain))).toBe(plain)
  })

  it('round-trips an empty string', () => {
    expect(decryptSecret(encryptSecret(''))).toBe('')
  })

  it('round-trips a 4096-char string', () => {
    const plain = 'x'.repeat(4096)
    expect(decryptSecret(encryptSecret(plain))).toBe(plain)
  })

  it('envelope matches v1:<b64>:<b64>:<b64> format (regex)', () => {
    const env = encryptSecret('anything')
    // v1 prefix, then exactly three base64 segments separated by ':'
    expect(env).toMatch(/^v1:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]*=*:[A-Za-z0-9+/]+=*$/)
    expect(env.split(':')).toHaveLength(4)
    expect(env.split(':')[0]).toBe('v1')
  })

  it('two encryptions of the same plaintext produce different envelopes (random IV)', () => {
    const a = encryptSecret('same')
    const b = encryptSecret('same')
    expect(a).not.toBe(b)
    // and they still both decrypt to the same plaintext
    expect(decryptSecret(a)).toBe('same')
    expect(decryptSecret(b)).toBe('same')
  })
})

describe('decryptSecret — failure paths', () => {
  it('throws on a wrong base64-32B key', () => {
    const envelope = encryptSecret('secret-data')
    const saved = process.env.PARCHMENT_SECRET_KEY
    process.env.PARCHMENT_SECRET_KEY = OTHER_KEY
    try {
      expect(() => decryptSecret(envelope)).toThrow(DecryptError)
    } finally {
      process.env.PARCHMENT_SECRET_KEY = saved
    }
  })

  it('throws on a truncated envelope (missing tag segment)', () => {
    const full = encryptSecret('secret-data')
    const parts = full.split(':')
    const truncated = parts.slice(0, 3).join(':') // drop the tag
    expect(() => decryptSecret(truncated)).toThrow(DecryptError)
  })

  it('throws on a tampered ciphertext (bit-flip)', () => {
    const full = encryptSecret('secret-data')
    const [v, iv, ct, tag] = full.split(':')
    // flip a bit in the ciphertext
    const ctBuf = Buffer.from(ct as string, 'base64')
    ctBuf[0] = (ctBuf[0] ?? 0) ^ 0x01
    const tampered = [v, iv, ctBuf.toString('base64'), tag].join(':')
    expect(() => decryptSecret(tampered)).toThrow(DecryptError)
  })

  it('throws on an unknown envelope version prefix', () => {
    const full = encryptSecret('secret-data')
    const rest = full.split(':').slice(1).join(':')
    expect(() => decryptSecret(`v2:${rest}`)).toThrow(DecryptError)
  })

  it('error message does NOT contain the plaintext or the key', () => {
    const plain = 'TOP-SECRET-PLAINTEXT-9f3a'
    const envelope = encryptSecret(plain)
    const [v, iv, ct, tag] = envelope.split(':')
    const tagBuf = Buffer.from(tag as string, 'base64')
    tagBuf[0] = (tagBuf[0] ?? 0) ^ 0xff
    const tampered = [v, iv, ct, tagBuf.toString('base64')].join(':')
    try {
      decryptSecret(tampered)
      throw new Error('expected decryptSecret to throw')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      expect(msg).not.toContain(plain)
      expect(msg).not.toContain(VALID_KEY)
      expect(err).toBeInstanceOf(DecryptError)
    }
  })
})
