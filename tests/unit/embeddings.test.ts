import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMBEDDING_DIM } from '@/lib/search/embeddings'

const makeVector = (length: number, fill = 0.1) => Array.from({ length }, () => fill)

describe('embeddings module', () => {
  let originalUrl: string | undefined
  let originalModel: string | undefined
  let originalKey: string | undefined
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalUrl = process.env.EMBEDDINGS_URL
    originalModel = process.env.EMBEDDINGS_MODEL
    originalKey = process.env.EMBEDDINGS_API_KEY
    originalFetch = globalThis.fetch
    // Reset module registry so env changes take effect
    vi.resetModules()
  })

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.EMBEDDINGS_URL
    } else {
      process.env.EMBEDDINGS_URL = originalUrl
    }
    if (originalModel === undefined) {
      delete process.env.EMBEDDINGS_MODEL
    } else {
      process.env.EMBEDDINGS_MODEL = originalModel
    }
    if (originalKey === undefined) {
      delete process.env.EMBEDDINGS_API_KEY
    } else {
      process.env.EMBEDDINGS_API_KEY = originalKey
    }
    globalThis.fetch = originalFetch
  })

  it('isSemanticEnabled returns false when EMBEDDINGS_URL is unset', async () => {
    delete process.env.EMBEDDINGS_URL
    const { isSemanticEnabled } = await import('@/lib/search/embeddings')
    expect(isSemanticEnabled()).toBe(false)
  })

  it('isSemanticEnabled returns true when EMBEDDINGS_URL is set', async () => {
    process.env.EMBEDDINGS_URL = 'http://localhost:11434/v1/embeddings'
    const { isSemanticEnabled } = await import('@/lib/search/embeddings')
    expect(isSemanticEnabled()).toBe(true)
  })

  it('embed returns null when disabled (no fetch call)', async () => {
    delete process.env.EMBEDDINGS_URL
    const mockFetch = vi.fn()
    globalThis.fetch = mockFetch
    const { embed } = await import('@/lib/search/embeddings')
    const result = await embed('hello world')
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('embed posts to EMBEDDINGS_URL with right body/model and returns vector', async () => {
    process.env.EMBEDDINGS_URL = 'http://test-embed.local/v1/embeddings'
    process.env.EMBEDDINGS_MODEL = 'my-model'
    delete process.env.EMBEDDINGS_API_KEY

    const mockVector = makeVector(EMBEDDING_DIM, 0.42)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: mockVector }] }),
    } as Response)

    const { embed } = await import('@/lib/search/embeddings')
    const result = await embed('test text')

    expect(result).toEqual(mockVector)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://test-embed.local/v1/embeddings')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string) as { model: string; input: string }
    expect(body.model).toBe('my-model')
    expect(body.input).toBe('test text')
  })

  it('embed includes Authorization header when EMBEDDINGS_API_KEY is set', async () => {
    process.env.EMBEDDINGS_URL = 'http://test-embed.local/v1/embeddings'
    process.env.EMBEDDINGS_API_KEY = 'secret-key'

    const mockVector = makeVector(EMBEDDING_DIM)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: mockVector }] }),
    } as Response)

    const { embed } = await import('@/lib/search/embeddings')
    await embed('hello')

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer secret-key')
  })

  it('embed returns null when response vector length != EMBEDDING_DIM', async () => {
    process.env.EMBEDDINGS_URL = 'http://test-embed.local/v1/embeddings'

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), // wrong length
    } as Response)

    const { embed } = await import('@/lib/search/embeddings')
    const result = await embed('test')
    expect(result).toBeNull()
  })

  it('embed returns null when fetch rejects (no throw)', async () => {
    process.env.EMBEDDINGS_URL = 'http://test-embed.local/v1/embeddings'

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    const { embed } = await import('@/lib/search/embeddings')
    const result = await embed('test')
    expect(result).toBeNull()
  })

  it('embed returns null when response is not ok', async () => {
    process.env.EMBEDDINGS_URL = 'http://test-embed.local/v1/embeddings'

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response)

    const { embed } = await import('@/lib/search/embeddings')
    const result = await embed('test')
    expect(result).toBeNull()
  })
})
