import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGoogleFontWoff2 } from '@/lib/fonts/google-fonts-server'

// v0.2.7 #4b: the server-side fetch+cache. fetch is injected (no real network). We
// assert the SSRF gate, the two-step CSS→woff2 fetch, the disk cache, and that a
// non-allow-listed family never triggers any outbound request.

let root: string
const realFilesRoot = process.env.PARCHMENT_FILES_ROOT

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pf-fonts-'))
  process.env.PARCHMENT_FILES_ROOT = root
})
afterEach(() => {
  if (realFilesRoot === undefined) delete process.env.PARCHMENT_FILES_ROOT
  else process.env.PARCHMENT_FILES_ROOT = realFilesRoot
})

function fakeFetch(woff2Bytes: Uint8Array) {
  const css = `@font-face{font-family:'Inter';src:url(https://fonts.gstatic.com/s/inter/v13/x.woff2) format('woff2');}`
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    if (u.includes('fonts.googleapis.com/css2')) {
      return new Response(css, { status: 200 })
    }
    if (u === 'https://fonts.gstatic.com/s/inter/v13/x.woff2') {
      // Pass the underlying ArrayBuffer so the Response body types cleanly.
      return new Response(woff2Bytes.buffer as ArrayBuffer, { status: 200 })
    }
    return new Response('nope', { status: 404 })
  })
}

describe('getGoogleFontWoff2', () => {
  it('fetches CSS then the gstatic woff2 for an allow-listed family, and caches it', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const fetchImpl = fakeFetch(bytes) as unknown as typeof fetch

    const out = await getGoogleFontWoff2('Inter', fetchImpl)
    expect(out).not.toBeNull()
    expect(Array.from(out as Uint8Array)).toEqual([1, 2, 3, 4, 5])
    // Two outbound calls: CSS API + the woff2.
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(2)

    // Second call is served from the disk cache → NO further outbound fetches.
    const cached = await getGoogleFontWoff2('Inter', fetchImpl)
    expect(Array.from(cached as Uint8Array)).toEqual([1, 2, 3, 4, 5])
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(2)
  })

  it('returns null and makes ZERO requests for a non-allow-listed family (SSRF gate)', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const out = await getGoogleFontWoff2('Evil; rm -rf', fetchImpl)
    expect(out).toBeNull()
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0)
  })

  it('returns null when the CSS response has no gstatic woff2', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('<html>error</html>', { status: 200 }),
    ) as unknown as typeof fetch
    expect(await getGoogleFontWoff2('Lora', fetchImpl)).toBeNull()
  })

  it('returns null when the woff2 download fails', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('css2')) {
        return new Response(
          `src:url(https://fonts.gstatic.com/s/lora/v1/y.woff2) format('woff2')`,
          { status: 200 },
        )
      }
      return new Response('', { status: 500 })
    }) as unknown as typeof fetch
    expect(await getGoogleFontWoff2('Lora', fetchImpl)).toBeNull()
  })
})
