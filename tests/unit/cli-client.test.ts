// J9: ParchmentClient unit tests against a STUBBED fetch — no live server. Asserts
// the client targets the right method/path, attaches the PAT as a Bearer header,
// and surfaces non-2xx responses as errors (so a docs:read token's 403 on a write
// is reported, not swallowed).

import { describe, expect, it, vi } from 'vitest'
import { ParchmentClient } from '@/../cli/client'

type Call = { url: string; init: RequestInit | undefined }

function stubFetch(response: {
  status?: number
  json?: unknown
  bytes?: Uint8Array
  contentType?: string
}): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    const status = response.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'content-type' ? (response.contentType ?? 'application/json') : null,
      },
      json: async () => response.json ?? {},
      text: async () => JSON.stringify(response.json ?? {}),
      arrayBuffer: async () => (response.bytes ?? new Uint8Array()).buffer,
    } as unknown as Response
  }) as unknown as typeof fetch
  return { fetch: fetchImpl, calls }
}

describe('ParchmentClient', () => {
  it('listDocs GETs /api/docs with a Bearer token', async () => {
    const { fetch, calls } = stubFetch({ json: [{ id: '1', title: 'A' }] })
    const client = new ParchmentClient('http://h:3000', 'pat_abc', fetch)
    const docs = await client.listDocs()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('http://h:3000/api/docs')
    expect(calls[0]?.init?.method ?? 'GET').toBe('GET')
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers.Authorization ?? headers.authorization).toBe('Bearer pat_abc')
    expect(docs).toEqual([{ id: '1', title: 'A' }])
  })

  it('strips a trailing slash from the base URL', async () => {
    const { fetch, calls } = stubFetch({ json: [] })
    const client = new ParchmentClient('http://h:3000/', 'pat_abc', fetch)
    await client.listDocs()
    expect(calls[0]?.url).toBe('http://h:3000/api/docs')
  })

  it('search GETs /api/search with the query encoded', async () => {
    const { fetch, calls } = stubFetch({ json: { results: [] } })
    const client = new ParchmentClient('http://h:3000', 'pat_abc', fetch)
    await client.search('hello world')
    expect(calls[0]?.url).toBe('http://h:3000/api/search?q=hello+world')
  })

  it('exportBackup GETs the zip bytes from /api/backup/export', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    const { fetch, calls } = stubFetch({ bytes, contentType: 'application/zip' })
    const client = new ParchmentClient('http://h:3000', 'pat_abc', fetch)
    const out = await client.exportBackup()
    expect(calls[0]?.url).toBe('http://h:3000/api/backup/export')
    expect(Array.from(out)).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it('importDoc POSTs multipart to /api/docs/import', async () => {
    const { fetch, calls } = stubFetch({ json: { id: 'new-id', warnings: [] } })
    const client = new ParchmentClient('http://h:3000', 'pat_abc', fetch)
    const res = await client.importDoc('note.md', new Uint8Array([0x23]))
    expect(calls[0]?.url).toBe('http://h:3000/api/docs/import')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(calls[0]?.init?.body).toBeInstanceOf(FormData)
    expect(res.id).toBe('new-id')
  })

  it('restoreBackup POSTs multipart to /api/backup/restore', async () => {
    const { fetch, calls } = stubFetch({ json: { ok: true } })
    const client = new ParchmentClient('http://h:3000', 'pat_abc', fetch)
    await client.restoreBackup(new Uint8Array([0x50, 0x4b]))
    expect(calls[0]?.url).toBe('http://h:3000/api/backup/restore')
    expect(calls[0]?.init?.method).toBe('POST')
  })

  it('surfaces a 403 (insufficient scope) as a thrown error, not a silent pass', async () => {
    const { fetch } = stubFetch({ status: 403, json: { error: 'insufficient_scope' } })
    const client = new ParchmentClient('http://h:3000', 'pat_read', fetch)
    await expect(client.restoreBackup(new Uint8Array([0x50]))).rejects.toThrow(/403|scope/i)
  })

  it('surfaces a 401 (bad token) as a thrown error', async () => {
    const { fetch } = stubFetch({ status: 401, json: { error: 'unauthorized' } })
    const client = new ParchmentClient('http://h:3000', 'pat_bad', fetch)
    await expect(client.listDocs()).rejects.toThrow(/401|unauthor/i)
  })

  it('uses the global fetch when none is injected', async () => {
    const spy = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => [],
          text: async () => '[]',
          arrayBuffer: async () => new Uint8Array().buffer,
        }) as unknown as Response,
    )
    const orig = globalThis.fetch
    globalThis.fetch = spy as unknown as typeof fetch
    try {
      const client = new ParchmentClient('http://h:3000', 'pat_abc')
      await client.listDocs()
      expect(spy).toHaveBeenCalledOnce()
    } finally {
      globalThis.fetch = orig
    }
  })
})
