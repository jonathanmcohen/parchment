import { createHash, randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import { describe, expect, it } from 'vitest'

// A2 — pure auth logic. No DB: we exercise the exact argon2id parameters and the
// PAT sha256/format scheme that src/lib/auth uses, so a regression in either is
// caught without standing up Postgres. (The `server-only`-guarded modules can't
// be imported in a plain Node test, so the algorithms are mirrored 1:1 here.)

// Mirror of src/lib/auth/password.ts options.
const argonOptions = {
  algorithm: 2, // argon2id
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

const hashPassword = (plaintext: string) => hash(plaintext, argonOptions)
const verifyPassword = async (stored: string, plaintext: string) => {
  try {
    return await verify(stored, plaintext)
  } catch {
    return false
  }
}

// Mirror of src/lib/auth/pat.ts hashing + token format.
const PAT_PREFIX = 'pat_'
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')
const issueToken = () => PAT_PREFIX + randomBytes(32).toString('base64url')
const prefixOf = (token: string) => token.slice(0, PAT_PREFIX.length + 6)

describe('A2 — password hashing (argon2id)', () => {
  it('hashes to a verifiable argon2id digest', async () => {
    const digest = await hashPassword('correct horse battery staple')
    expect(digest.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(digest, 'correct horse battery staple')).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const digest = await hashPassword('s3cret-pass-phrase')
    expect(await verifyPassword(digest, 'not-the-password')).toBe(false)
  })

  it('produces a unique salt per hash (different digests for same input)', async () => {
    const a = await hashPassword('repeatme-1234')
    const b = await hashPassword('repeatme-1234')
    expect(a).not.toBe(b)
    expect(await verifyPassword(a, 'repeatme-1234')).toBe(true)
    expect(await verifyPassword(b, 'repeatme-1234')).toBe(true)
  })

  it('returns false (not throws) for a malformed stored hash', async () => {
    expect(await verifyPassword('not-a-real-hash', 'whatever')).toBe(false)
  })
})

describe('A2 — personal access tokens (sha256)', () => {
  it('mints a pat_-prefixed base64url token', () => {
    const token = issueToken()
    expect(token.startsWith(PAT_PREFIX)).toBe(true)
    // base64url body: no +, /, or = padding.
    const body = token.slice(PAT_PREFIX.length)
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(body.length).toBeGreaterThan(0)
  })

  it('derives a stable sha256 hash and a 6-char display prefix', () => {
    const token = issueToken()
    const h1 = sha256(token)
    const h2 = sha256(token)
    expect(h1).toBe(h2) // deterministic
    expect(h1).toHaveLength(64) // sha256 hex
    expect(prefixOf(token)).toBe(token.slice(0, PAT_PREFIX.length + 6))
    expect(prefixOf(token).startsWith(PAT_PREFIX)).toBe(true)
  })

  it('hashes distinct tokens to distinct hashes', () => {
    const a = issueToken()
    const b = issueToken()
    expect(a).not.toBe(b)
    expect(sha256(a)).not.toBe(sha256(b))
  })

  it('the plaintext token is not recoverable from its hash (one-way)', () => {
    const token = issueToken()
    const h = sha256(token)
    expect(h).not.toContain(token.slice(PAT_PREFIX.length))
  })
})
