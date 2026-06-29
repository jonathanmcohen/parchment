// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.2 #9: RP-initiated single-logout. buildEndSessionRedirect returns the IdP
// end_session URL (with post_logout_redirect_uri = <publicUrl>/login) ONLY when the
// discovered metadata advertises an end_session_endpoint; otherwise null so logout
// falls back to local-only. tests/setup.ts → PARCHMENT_PUBLIC_URL=http://localhost:3000.

const { buildEndSessionUrl } = vi.hoisted(() => ({
  buildEndSessionUrl: vi.fn<(config: unknown, params: Record<string, string>) => URL>(),
}))

vi.mock('openid-client', () => ({
  buildEndSessionUrl,
  // discovery etc. are not exercised by buildEndSessionRedirect (it takes a config).
  allowInsecureRequests: Symbol('allowInsecureRequests'),
}))

import { buildEndSessionRedirect } from '@/lib/auth/oidc-client'

type FakeConfig = { serverMetadata: () => { end_session_endpoint?: string } }

function configWith(endSession?: string): FakeConfig {
  return { serverMetadata: () => (endSession ? { end_session_endpoint: endSession } : {}) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildEndSessionRedirect', () => {
  it('returns null when the IdP does not advertise end_session_endpoint (local logout)', () => {
    const url = buildEndSessionRedirect(configWith(undefined) as never)
    expect(url).toBeNull()
    expect(buildEndSessionUrl).not.toHaveBeenCalled()
  })

  it('builds the end-session URL with post_logout_redirect_uri = <publicUrl>/login', () => {
    buildEndSessionUrl.mockReturnValue(
      new URL(
        'https://idp.example.com/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Flogin',
      ),
    )
    const out = buildEndSessionRedirect(configWith('https://idp.example.com/logout') as never)
    expect(out).toBe(
      'https://idp.example.com/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Flogin',
    )
    expect(buildEndSessionUrl).toHaveBeenCalledTimes(1)
    const params = buildEndSessionUrl.mock.calls[0]?.[1] as Record<string, string>
    expect(params.post_logout_redirect_uri).toBe('http://localhost:3000/login')
  })

  it('passes id_token_hint when an id_token is supplied', () => {
    buildEndSessionUrl.mockReturnValue(new URL('https://idp.example.com/logout'))
    buildEndSessionRedirect(configWith('https://idp.example.com/logout') as never, 'the-id-token')
    const params = buildEndSessionUrl.mock.calls[0]?.[1] as Record<string, string>
    expect(params.id_token_hint).toBe('the-id-token')
  })
})
