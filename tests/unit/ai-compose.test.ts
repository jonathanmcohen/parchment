import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// compose.ts uses 'server-only' — mock it so tests don't fail on import
vi.mock('server-only', () => ({}))

describe('compose module', () => {
  let originalBaseUrl: string | undefined
  let originalApiKey: string | undefined
  let originalModel: string | undefined
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalBaseUrl = process.env.AI_BASE_URL
    originalApiKey = process.env.AI_API_KEY
    originalModel = process.env.AI_MODEL
    originalFetch = globalThis.fetch
    vi.resetModules()
  })

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.AI_BASE_URL
    } else {
      process.env.AI_BASE_URL = originalBaseUrl
    }
    if (originalApiKey === undefined) {
      delete process.env.AI_API_KEY
    } else {
      process.env.AI_API_KEY = originalApiKey
    }
    if (originalModel === undefined) {
      delete process.env.AI_MODEL
    } else {
      process.env.AI_MODEL = originalModel
    }
    globalThis.fetch = originalFetch
  })

  it('isAiEnabled returns false when AI_BASE_URL is unset', async () => {
    delete process.env.AI_BASE_URL
    const { isAiEnabled } = await import('@/lib/ai/compose')
    expect(isAiEnabled()).toBe(false)
  })

  it('isAiEnabled returns true when AI_BASE_URL is set', async () => {
    process.env.AI_BASE_URL = 'http://homelab:11434/v1'
    const { isAiEnabled } = await import('@/lib/ai/compose')
    expect(isAiEnabled()).toBe(true)
  })

  it('composeText returns null without fetching when AI_BASE_URL is unset', async () => {
    delete process.env.AI_BASE_URL
    const mockFetch = vi.fn()
    globalThis.fetch = mockFetch
    const { composeText } = await import('@/lib/ai/compose')
    const result = await composeText({ operation: 'improve', text: 'hello' })
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('composeText returns the assistant content when enabled', async () => {
    process.env.AI_BASE_URL = 'http://test.local/v1'
    delete process.env.AI_API_KEY

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'improved text' } }],
      }),
    } as Response)

    const { composeText } = await import('@/lib/ai/compose')
    const result = await composeText({ operation: 'improve', text: 'hello' })
    expect(result).toBe('improved text')
  })

  it('composeText strips a markdown code fence from the response', async () => {
    process.env.AI_BASE_URL = 'http://test.local/v1'

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```\nstripped content\n```' } }],
      }),
    } as Response)

    const { composeText } = await import('@/lib/ai/compose')
    const result = await composeText({ operation: 'shorten', text: 'verbose text' })
    expect(result).toBe('stripped content')
  })

  it('composeText returns null on a non-ok response', async () => {
    process.env.AI_BASE_URL = 'http://test.local/v1'

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response)

    const { composeText } = await import('@/lib/ai/compose')
    const result = await composeText({ operation: 'improve', text: 'hello' })
    expect(result).toBeNull()
  })

  it('composeText caps long input so the fetched body text length is bounded', async () => {
    process.env.AI_BASE_URL = 'http://test.local/v1'

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
      }),
    } as Response)

    const { composeText } = await import('@/lib/ai/compose')
    const longText = 'x'.repeat(20_000)
    await composeText({ operation: 'improve', text: longText })

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const userMsg = body.messages.find((m) => m.role === 'user')
    expect(userMsg).toBeDefined()
    // The user message content should be capped at 8000 chars
    expect((userMsg?.content ?? '').length).toBeLessThanOrEqual(8000)
  })
})
