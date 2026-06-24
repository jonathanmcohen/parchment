import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildShareUrl } from '@/lib/docs/share-link'

// CF4: the share-viewer link must be built from FIXED public config, never the
// request origin. Behind Caddy `req.nextUrl.origin` is the internal 0.0.0.0:3000
// bind, so a req-derived link leaks the wrong host into the copyable URL.
//
// Two layers are proven here:
//   1. buildShareUrl(baseUrl, token) — pure: the host always comes from baseUrl.
//   2. env.publicUrl — resolves PUBLIC_URL > PARCHMENT_RP_ORIGIN > localhost.
// `env` is an eager module-load snapshot, so env tests stub process.env then
// re-import via vi.resetModules() (the email-in.test.ts idiom).

const TOKEN = 'tok-abc123'

describe('CF4 — buildShareUrl (pure)', () => {
  it('builds the /share/<token> path from the given public base URL', () => {
    expect(buildShareUrl('https://parchment.local.jonco.dev', TOKEN)).toBe(
      `https://parchment.local.jonco.dev/share/${TOKEN}`,
    )
  })

  it('uses the base host — NEVER a request origin like 0.0.0.0:3000', () => {
    const url = buildShareUrl('https://docs.example.com', TOKEN)
    expect(url).toBe(`https://docs.example.com/share/${TOKEN}`)
    expect(url).not.toContain('0.0.0.0')
  })

  it('preserves an explicit port and scheme from the base URL', () => {
    expect(buildShareUrl('http://localhost:3000', TOKEN)).toBe(
      `http://localhost:3000/share/${TOKEN}`,
    )
  })
})

describe('CF4 — shareUrl is built from env.publicUrl (not the request origin)', () => {
  const KEYS = ['PUBLIC_URL', 'PARCHMENT_RP_ORIGIN'] as const
  let saved: Record<string, string | undefined>

  beforeEach(() => {
    saved = {}
    for (const k of KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
    vi.resetModules()
  })

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    vi.resetModules()
  })

  it('PUBLIC_URL wins: the share url uses that host', async () => {
    process.env.PUBLIC_URL = 'https://share.public.example'
    process.env.PARCHMENT_RP_ORIGIN = 'https://auth.example'
    const { env } = await import('@/lib/env')
    expect(env.publicUrl).toBe('https://share.public.example')
    expect(buildShareUrl(env.publicUrl, TOKEN)).toBe(`https://share.public.example/share/${TOKEN}`)
  })

  it('falls back to PARCHMENT_RP_ORIGIN when PUBLIC_URL is unset (deploy self-corrects)', async () => {
    process.env.PARCHMENT_RP_ORIGIN = 'https://parchment.local.jonco.dev'
    const { env } = await import('@/lib/env')
    expect(env.publicUrl).toBe('https://parchment.local.jonco.dev')
    expect(buildShareUrl(env.publicUrl, TOKEN)).toBe(
      `https://parchment.local.jonco.dev/share/${TOKEN}`,
    )
  })

  it('defaults to http://localhost:3000 when neither is set (dev)', async () => {
    const { env } = await import('@/lib/env')
    expect(env.publicUrl).toBe('http://localhost:3000')
    expect(buildShareUrl(env.publicUrl, TOKEN)).toBe(`http://localhost:3000/share/${TOKEN}`)
  })
})
