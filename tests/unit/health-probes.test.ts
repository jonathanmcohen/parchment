import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// I6: probeOllama / probeS3 unit tests — stubs process.env + global fetch.
// probes.ts imports server-side modules (drizzle, env); mock the deps that
// would fail outside a real server environment.

vi.mock('@/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/env', () => ({
  env: { collabUrl: 'ws://localhost:1234', collabPort: 1234, filesRoot: '/tmp' },
}))
vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/.health-test'),
  rm: vi.fn().mockResolvedValue(undefined),
}))

describe('I6 — probeOllama', () => {
  let originalBaseUrl: string | undefined
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalBaseUrl = process.env.AI_BASE_URL
    originalFetch = globalThis.fetch
    vi.resetModules()
  })

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.AI_BASE_URL
    } else {
      process.env.AI_BASE_URL = originalBaseUrl
    }
    globalThis.fetch = originalFetch
  })

  it('returns null when AI_BASE_URL is unset', async () => {
    delete process.env.AI_BASE_URL
    const { probeOllama } = await import('@/lib/health/probes')
    const result = await probeOllama()
    expect(result).toBeNull()
  })

  it('returns an up pill when AI_BASE_URL is set and fetch succeeds', async () => {
    process.env.AI_BASE_URL = 'http://homelab:11434/v1'
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)

    const { probeOllama } = await import('@/lib/health/probes')
    const result = await probeOllama()
    expect(result).not.toBeNull()
    expect(result?.name).toBe('ollama')
    expect(result?.status).toBe('up')
    expect(result?.detail).toBe('http://homelab:11434/v1')
  })

  it('returns a down pill (not throw) when AI_BASE_URL is set but fetch fails', async () => {
    process.env.AI_BASE_URL = 'http://homelab:11434/v1'
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connection refused'))

    const { probeOllama } = await import('@/lib/health/probes')
    const result = await probeOllama()
    expect(result).not.toBeNull()
    expect(result?.name).toBe('ollama')
    expect(result?.status).toBe('down')
    expect(result?.detail).toContain('connection refused')
  })
})

describe('I6 — probeS3', () => {
  let originalEndpoint: string | undefined
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalEndpoint = process.env.BACKUP_S3_ENDPOINT
    originalFetch = globalThis.fetch
    vi.resetModules()
  })

  afterEach(() => {
    if (originalEndpoint === undefined) {
      delete process.env.BACKUP_S3_ENDPOINT
    } else {
      process.env.BACKUP_S3_ENDPOINT = originalEndpoint
    }
    globalThis.fetch = originalFetch
  })

  it('returns null when BACKUP_S3_ENDPOINT is unset', async () => {
    delete process.env.BACKUP_S3_ENDPOINT
    const { probeS3 } = await import('@/lib/health/probes')
    const result = await probeS3()
    expect(result).toBeNull()
  })

  it('returns an up pill when BACKUP_S3_ENDPOINT is set and fetch succeeds', async () => {
    process.env.BACKUP_S3_ENDPOINT = 'https://s3.example.com'
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)

    const { probeS3 } = await import('@/lib/health/probes')
    const result = await probeS3()
    expect(result).not.toBeNull()
    expect(result?.name).toBe('s3')
    expect(result?.status).toBe('up')
    expect(result?.detail).toBe('https://s3.example.com')
  })

  it('returns a down pill (not throw) when BACKUP_S3_ENDPOINT is set but fetch fails', async () => {
    process.env.BACKUP_S3_ENDPOINT = 'https://s3.example.com'
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network unreachable'))

    const { probeS3 } = await import('@/lib/health/probes')
    const result = await probeS3()
    expect(result).not.toBeNull()
    expect(result?.name).toBe('s3')
    expect(result?.status).toBe('down')
    expect(result?.detail).toContain('network unreachable')
  })
})

describe('I6 — probeAll filters nulls', () => {
  let originalBaseUrl: string | undefined
  let originalEndpoint: string | undefined
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalBaseUrl = process.env.AI_BASE_URL
    originalEndpoint = process.env.BACKUP_S3_ENDPOINT
    originalFetch = globalThis.fetch
    vi.resetModules()
  })

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.AI_BASE_URL
    } else {
      process.env.AI_BASE_URL = originalBaseUrl
    }
    if (originalEndpoint === undefined) {
      delete process.env.BACKUP_S3_ENDPOINT
    } else {
      process.env.BACKUP_S3_ENDPOINT = originalEndpoint
    }
    globalThis.fetch = originalFetch
  })

  it('omits Ollama and S3 pills when neither env var is set', async () => {
    delete process.env.AI_BASE_URL
    delete process.env.BACKUP_S3_ENDPOINT

    // Stub fetch for the always-on probes (collab, disk).
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)

    // Mock DB so probeDatabase / probeSearchIndex don't fail.
    vi.doMock('@/db', () => ({
      db: {
        execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      },
      schema: {},
    }))

    const { probeAll } = await import('@/lib/health/probes')
    const pills = await probeAll()
    const names = pills.map((p) => p.name)
    expect(names).not.toContain('ollama')
    expect(names).not.toContain('s3')
  })
})
