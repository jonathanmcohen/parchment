import { describe, expect, it } from 'vitest'
import {
  buildRecoverySearchUrl,
  interpretRecoveryResponse,
  recoveryResultHref,
} from '@/lib/search/recovery'

describe('buildRecoverySearchUrl', () => {
  it('returns null for an empty query', () => {
    expect(buildRecoverySearchUrl('')).toBeNull()
  })

  it('returns null for a whitespace-only query', () => {
    expect(buildRecoverySearchUrl('   ')).toBeNull()
  })

  it('encodes the trimmed query into the search route', () => {
    expect(buildRecoverySearchUrl('hello world')).toBe('/api/search?q=hello%20world')
  })

  it('escapes special characters', () => {
    expect(buildRecoverySearchUrl('a&b=c')).toBe('/api/search?q=a%26b%3Dc')
  })

  it('trims surrounding whitespace before encoding', () => {
    expect(buildRecoverySearchUrl('  draft  ')).toBe('/api/search?q=draft')
  })
})

describe('interpretRecoveryResponse', () => {
  it('treats 401 as unauthenticated (auth gate)', () => {
    expect(interpretRecoveryResponse(401, null)).toEqual({ status: 'unauthenticated' })
  })

  it('returns results on a 200 with a results array', () => {
    const results = [{ id: '1', title: 'Doc', preview: 'snippet' }]
    expect(interpretRecoveryResponse(200, { results })).toEqual({ status: 'ok', results })
  })

  it('returns an empty result list when the body omits results', () => {
    expect(interpretRecoveryResponse(200, {})).toEqual({ status: 'ok', results: [] })
  })

  it('treats null body on 2xx as an empty result list', () => {
    expect(interpretRecoveryResponse(204, null)).toEqual({ status: 'ok', results: [] })
  })

  it('treats a 500 as an error (box stays, no results)', () => {
    expect(interpretRecoveryResponse(500, null)).toEqual({ status: 'error' })
  })

  it('treats a 403 as an error, not the auth gate', () => {
    expect(interpretRecoveryResponse(403, null)).toEqual({ status: 'error' })
  })
})

describe('recoveryResultHref', () => {
  it('links to the per-document route', () => {
    expect(recoveryResultHref('abc123')).toBe('/d/abc123')
  })
})
