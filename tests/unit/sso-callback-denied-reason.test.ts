import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.4 #3b: a refused SSO login must be DEBUGGABLE. Previously every resolve
// failure collapsed to `/login?sso=denied`, so an admin could not tell a disabled
// account from an unverified-email-link block. The callback now threads the
// resolve `reason` through as `&reason=<code>` so the login page can explain why.

const {
  isOidcEnabled,
  getOidcConfig,
  discoverOidc,
  consumeOidcFlow,
  exchangeCallback,
  resolveOidcUser,
  createSession,
  logAuditRequest,
} = vi.hoisted(() => ({
  isOidcEnabled: vi.fn<() => Promise<boolean>>(),
  getOidcConfig: vi.fn<() => Promise<unknown>>(),
  discoverOidc: vi.fn<() => Promise<unknown>>(),
  consumeOidcFlow: vi.fn<() => Promise<unknown>>(),
  exchangeCallback: vi.fn<() => Promise<unknown>>(),
  resolveOidcUser: vi.fn<() => Promise<unknown>>(),
  createSession: vi.fn<() => Promise<void>>(),
  logAuditRequest: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/lib/auth/oidc-config', () => ({ isOidcEnabled, getOidcConfig }))
vi.mock('@/lib/auth/oidc-client', () => ({ discoverOidc, exchangeCallback }))
vi.mock('@/lib/auth/oidc-flow-repo', () => ({ consumeOidcFlow }))
vi.mock('@/lib/auth/oidc-account', () => ({ resolveOidcUser }))
vi.mock('@/lib/auth/session', () => ({ createSession }))
vi.mock('@/lib/audit', () => ({ logAuditRequest, logAudit: vi.fn() }))

import { GET as callbackGET } from '@/app/api/auth/sso/callback/route'

function req(pathAndQuery: string): NextRequest {
  return new NextRequest(`http://0.0.0.0:3000${pathAndQuery}`)
}

function location(res: Response): URL {
  const loc = res.headers.get('location')
  expect(loc).toBeTruthy()
  return new URL(loc as string)
}

// A request that gets all the way to resolveOidcUser, which we then control.
function primeHappyPathUntilResolve() {
  isOidcEnabled.mockResolvedValue(true)
  consumeOidcFlow.mockResolvedValue({ nonce: 'n', codeVerifier: 'v', redirectTo: '/files' })
  getOidcConfig.mockResolvedValue({ clientSecret: 's' })
  discoverOidc.mockResolvedValue({})
  exchangeCallback.mockResolvedValue({ iss: 'https://idp', sub: 'u' })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SSO /callback — denial reason is threaded to /login', () => {
  it('surfaces reason=no_verified_email_for_link when the link gate blocks', async () => {
    primeHappyPathUntilResolve()
    resolveOidcUser.mockResolvedValue({ ok: false, reason: 'no_verified_email_for_link' })
    const url = location(await callbackGET(req('/api/auth/sso/callback?state=abc&code=xyz')))
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('sso')).toBe('denied')
    expect(url.searchParams.get('reason')).toBe('no_verified_email_for_link')
    // No session was ever created on a denied resolve.
    expect(createSession).not.toHaveBeenCalled()
  })

  it('surfaces reason=disabled when the account is disabled', async () => {
    primeHappyPathUntilResolve()
    resolveOidcUser.mockResolvedValue({ ok: false, reason: 'disabled' })
    const url = location(await callbackGET(req('/api/auth/sso/callback?state=abc&code=xyz')))
    expect(url.searchParams.get('sso')).toBe('denied')
    expect(url.searchParams.get('reason')).toBe('disabled')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('a successful resolve creates a session and does NOT carry a denied reason', async () => {
    primeHappyPathUntilResolve()
    resolveOidcUser.mockResolvedValue({ ok: true, userId: 'u1', outcome: 'link' })
    const url = location(await callbackGET(req('/api/auth/sso/callback?state=abc&code=xyz')))
    expect(url.pathname).toBe('/files')
    expect(url.searchParams.get('sso')).toBeNull()
    expect(createSession).toHaveBeenCalledWith('u1')
  })
})
