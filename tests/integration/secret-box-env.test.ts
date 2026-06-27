// Phase 0 Task 3 — env.ts validation for PARCHMENT_SECRET_KEY (§3c) and
// PARCHMENT_PUBLIC_URL (§7a). Despite living under tests/integration, these are
// pure-process tests (no DB, no container): they re-evaluate src/lib/env.ts under
// controlled env via vi.resetModules() + dynamic import().
//
// TDD RED record: written BEFORE the env.ts additions existed; all 8 tests failed
// (the new fields were undefined / the module did not throw). Now GREEN.
//
// IMPORTANT: env.ts validates at module-evaluation time, so each test sets the env,
// resets the module registry, then dynamically imports a FRESH copy of env.ts.
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const VALID_KEY = randomBytes(32).toString('base64')

// A baseline env that lets env.ts evaluate without throwing on UNRELATED required
// vars (DATABASE_URL has a fallback; PARCHMENT_PUBLIC_URL does not — it must be set
// for any case that is not specifically testing its absence).
function baseEnv(): void {
  vi.stubEnv('PARCHMENT_PUBLIC_URL', 'https://notes.example.com')
}

async function importEnv() {
  vi.resetModules()
  return (await import('@/lib/env')).env
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('env.ts — PARCHMENT_SECRET_KEY validation', () => {
  it('accepts a valid base64-32B key and sets secretKeyConfigured = true', async () => {
    baseEnv()
    vi.stubEnv('PARCHMENT_SECRET_KEY', VALID_KEY)
    const env = await importEnv()
    expect(env.secretKey).toBe(VALID_KEY)
    expect(env.secretKeyConfigured).toBe(true)
  })

  it('throws at import-time when key is present but decodes to fewer than 32 bytes', async () => {
    baseEnv()
    vi.stubEnv('PARCHMENT_SECRET_KEY', randomBytes(16).toString('base64'))
    await expect(importEnv()).rejects.toThrow(/32 bytes/)
  })

  it('throws at import-time when key is present but decodes to more than 32 bytes', async () => {
    baseEnv()
    vi.stubEnv('PARCHMENT_SECRET_KEY', randomBytes(48).toString('base64'))
    await expect(importEnv()).rejects.toThrow(/32 bytes/)
  })

  it('throws at import-time when key is present but is not valid base64', async () => {
    baseEnv()
    // '!' and '@' are outside the base64 alphabet; Buffer.from would silently drop
    // them, so env.ts re-checks by re-encoding and comparing — this must throw.
    vi.stubEnv('PARCHMENT_SECRET_KEY', '!!!not-base64!!!@@@')
    await expect(importEnv()).rejects.toThrow(/PARCHMENT_SECRET_KEY/)
  })

  it('sets secretKeyConfigured = false and does NOT throw when key is absent', async () => {
    baseEnv()
    vi.stubEnv('PARCHMENT_SECRET_KEY', '')
    // Empty string is treated as absent.
    const env = await importEnv()
    expect(env.secretKey).toBeNull()
    expect(env.secretKeyConfigured).toBe(false)
  })

  it('encryptSecret throws a clear error (not a crypto crash) when called without key set', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('PARCHMENT_SECRET_KEY', '')
    vi.resetModules()
    const { encryptSecret } = await import('@/lib/crypto/secret-box')
    expect(() => encryptSecret('x')).toThrow(/PARCHMENT_SECRET_KEY is not set/)
  })
})

describe('env.ts — PARCHMENT_PUBLIC_URL validation', () => {
  it('accepts a valid URL and strips trailing slash', async () => {
    vi.stubEnv('PARCHMENT_PUBLIC_URL', 'https://notes.example.com/')
    const env = await importEnv()
    expect(env.publicUrl).toBe('https://notes.example.com')
  })

  it('throws at import-time when PARCHMENT_PUBLIC_URL is absent', async () => {
    vi.stubEnv('PARCHMENT_PUBLIC_URL', '')
    await expect(importEnv()).rejects.toThrow(/PARCHMENT_PUBLIC_URL is required/)
  })
})
