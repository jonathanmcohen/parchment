// @vitest-environment node
//
// K7: LanguageTool integration coverage — off-by-default config, the response
// mapping (raw LT /v2/check → our Match[]), resilience (fetch failure / non-2xx
// / bad shape → []), input-length cap, locale normalization, and the
// server-only API-key handling. fetch is stubbed (no live LanguageTool). Mirrors
// the ai-compose.test.ts env + fetch-stub structure.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// languagetool.ts uses 'server-only' — mock it so the import does not fail.
vi.mock('server-only', () => ({}))

describe('K7 — languagetool module', () => {
  let originalUrl: string | undefined
  let originalKey: string | undefined
  let originalUser: string | undefined
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalUrl = process.env.LANGUAGETOOL_URL
    originalKey = process.env.LANGUAGETOOL_API_KEY
    originalUser = process.env.LANGUAGETOOL_USERNAME
    originalFetch = globalThis.fetch
    vi.resetModules()
  })

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.LANGUAGETOOL_URL
    else process.env.LANGUAGETOOL_URL = originalUrl
    if (originalKey === undefined) delete process.env.LANGUAGETOOL_API_KEY
    else process.env.LANGUAGETOOL_API_KEY = originalKey
    if (originalUser === undefined) delete process.env.LANGUAGETOOL_USERNAME
    else process.env.LANGUAGETOOL_USERNAME = originalUser
    globalThis.fetch = originalFetch
  })

  it('isLanguageToolEnabled reflects LANGUAGETOOL_URL', async () => {
    delete process.env.LANGUAGETOOL_URL
    let mod = await import('@/lib/integrations/languagetool')
    expect(mod.isLanguageToolEnabled()).toBe(false)

    vi.resetModules()
    process.env.LANGUAGETOOL_URL = 'http://lt.local:8010'
    mod = await import('@/lib/integrations/languagetool')
    expect(mod.isLanguageToolEnabled()).toBe(true)
  })

  it('checkGrammar returns [] WITHOUT fetching when LANGUAGETOOL_URL is unset', async () => {
    delete process.env.LANGUAGETOOL_URL
    const mockFetch = vi.fn()
    globalThis.fetch = mockFetch
    const { checkGrammar } = await import('@/lib/integrations/languagetool')
    const result = await checkGrammar('Some teh text')
    expect(result).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('maps a stubbed LanguageTool response to Match[]', async () => {
    process.env.LANGUAGETOOL_URL = 'http://lt.local:8010'
    delete process.env.LANGUAGETOOL_API_KEY

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        matches: [
          {
            offset: 5,
            length: 3,
            message: 'Possible spelling mistake',
            replacements: [{ value: 'the' }, { value: 'tech' }],
            rule: { id: 'MORFOLOGIK_RULE_EN_US', category: { id: 'TYPOS', name: 'Possible Typo' } },
          },
        ],
      }),
    } as Response)

    const { checkGrammar } = await import('@/lib/integrations/languagetool')
    const result = await checkGrammar('Some teh text')
    expect(result).toEqual([
      {
        offset: 5,
        length: 3,
        message: 'Possible spelling mistake',
        replacements: ['the', 'tech'],
        rule: { id: 'MORFOLOGIK_RULE_EN_US', category: 'TYPOS' },
      },
    ])
  })

  it('drops malformed matches (no numeric offset/length) but keeps valid ones', async () => {
    process.env.LANGUAGETOOL_URL = 'http://lt.local:8010'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        matches: [
          { offset: 'x', length: 3 }, // bad offset → dropped
          { offset: 0, length: 2, message: 'ok', replacements: [], rule: { id: 'R' } },
        ],
      }),
    } as Response)

    const { checkGrammar } = await import('@/lib/integrations/languagetool')
    const result = await checkGrammar('hi there')
    expect(result).toHaveLength(1)
    expect(result[0]?.offset).toBe(0)
    expect(result[0]?.rule.id).toBe('R')
  })

  it('returns [] on a fetch failure (NEVER throws)', async () => {
    process.env.LANGUAGETOOL_URL = 'http://lt.local:8010'
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    const { checkGrammar } = await import('@/lib/integrations/languagetool')
    await expect(checkGrammar('hello')).resolves.toEqual([])
  })

  it('returns [] on a non-ok response and on a bad-shape body', async () => {
    process.env.LANGUAGETOOL_URL = 'http://lt.local:8010'
    const { checkGrammar } = await import('@/lib/integrations/languagetool')

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
    expect(await checkGrammar('hello')).toEqual([])

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ matches: 'nope' }) } as Response)
    expect(await checkGrammar('hello')).toEqual([])
  })

  it('caps the input length sent to LanguageTool', async () => {
    process.env.LANGUAGETOOL_URL = 'http://lt.local:8010'
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) } as Response)
    globalThis.fetch = fetchMock

    const { checkGrammar, LANGUAGETOOL_INPUT_CAP } = await import('@/lib/integrations/languagetool')
    await checkGrammar('x'.repeat(LANGUAGETOOL_INPUT_CAP + 5_000))

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const params = new URLSearchParams(init.body as string)
    expect((params.get('text') ?? '').length).toBeLessThanOrEqual(LANGUAGETOOL_INPUT_CAP)
  })

  it('sends the API key in the body when set, and omits it when unset', async () => {
    process.env.LANGUAGETOOL_URL = 'http://lt.local:8010'
    process.env.LANGUAGETOOL_API_KEY = 'secret-key'
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) } as Response)
    globalThis.fetch = fetchMock

    const { checkGrammar } = await import('@/lib/integrations/languagetool')
    await checkGrammar('hello world')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const params = new URLSearchParams(init.body as string)
    expect(params.get('apiKey')).toBe('secret-key')
    expect(params.get('language')).toBe('en-US')
  })

  it('normalizeLocale rejects garbage and defaults to en-US', async () => {
    process.env.LANGUAGETOOL_URL = 'http://lt.local:8010'
    const { normalizeLocale } = await import('@/lib/integrations/languagetool')
    expect(normalizeLocale('de-DE')).toBe('de-DE')
    expect(normalizeLocale('fr')).toBe('fr')
    expect(normalizeLocale('../evil')).toBe('en-US')
    expect(normalizeLocale(42)).toBe('en-US')
    expect(normalizeLocale(undefined)).toBe('en-US')
  })
})
