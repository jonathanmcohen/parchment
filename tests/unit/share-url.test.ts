import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildShareUrl } from '@/lib/docs/share-link'

// CF4: the share-viewer link must be built from FIXED public config, never the
// request origin. Behind Caddy `req.nextUrl.origin` is the internal 0.0.0.0:3000
// bind, so a req-derived link leaks the wrong host into the copyable URL.
//
// Two layers are proven here:
//   1. buildShareUrl(baseUrl, token) — pure: the host always comes from baseUrl.
//   2. env.publicUrl — Phase 0 §7a: now resolves from the REQUIRED PARCHMENT_PUBLIC_URL
//      (trailing slash stripped; the process throws at boot if it is absent). This
//      replaced the old PUBLIC_URL > PARCHMENT_RP_ORIGIN > localhost fallback.
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

describe('CF4 / §7a — shareUrl is built from env.publicUrl (PARCHMENT_PUBLIC_URL)', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env.PARCHMENT_PUBLIC_URL
    vi.resetModules()
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.PARCHMENT_PUBLIC_URL
    else process.env.PARCHMENT_PUBLIC_URL = saved
    vi.resetModules()
  })

  it('uses PARCHMENT_PUBLIC_URL as the share-link host', async () => {
    process.env.PARCHMENT_PUBLIC_URL = 'https://share.public.example'
    const { env } = await import('@/lib/env')
    expect(env.publicUrl).toBe('https://share.public.example')
    expect(buildShareUrl(env.publicUrl, TOKEN)).toBe(`https://share.public.example/share/${TOKEN}`)
  })

  it('strips a trailing slash from PARCHMENT_PUBLIC_URL', async () => {
    process.env.PARCHMENT_PUBLIC_URL = 'https://parchment.local.jonco.dev/'
    const { env } = await import('@/lib/env')
    expect(env.publicUrl).toBe('https://parchment.local.jonco.dev')
    expect(buildShareUrl(env.publicUrl, TOKEN)).toBe(
      `https://parchment.local.jonco.dev/share/${TOKEN}`,
    )
  })

  it('throws at boot when PARCHMENT_PUBLIC_URL is absent (§7a — required)', async () => {
    delete process.env.PARCHMENT_PUBLIC_URL
    await expect(import('@/lib/env')).rejects.toThrow(/PARCHMENT_PUBLIC_URL is required/)
  })
})
