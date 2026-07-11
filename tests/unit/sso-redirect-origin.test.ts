import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.2 #1: SSO redirects must be built from env.publicUrl (PARCHMENT_PUBLIC_URL),
// NEVER from req.nextUrl.origin. Behind a TLS-terminating reverse proxy the request
// origin is the internal 0.0.0.0:3000 bind, which was leaking into the user-facing
// /login?sso=... redirect (and the post-login landing), sending the browser to a
// dead host. tests/setup.ts sets PARCHMENT_PUBLIC_URL=http://localhost:3000, so the
// Location header must point at localhost:3000 even when the request origin differs.

const {
  isOidcEnabled,
  getOidcConfig,
  discoverOidc,
  buildStart,
  createOidcFlow,
  consumeOidcFlow,
  exchangeCallback,
  resolveOidcUser,
  createSession,
  logAuditRequest,
} = vi.hoisted(() => ({
  isOidcEnabled: vi.fn<() => Promise<boolean>>(),
  getOidcConfig: vi.fn<() => Promise<unknown>>(),
  discoverOidc: vi.fn<() => Promise<unknown>>(),
  buildStart: vi.fn<() => Promise<unknown>>(),
  createOidcFlow: vi.fn<() => Promise<unknown>>(),
  consumeOidcFlow: vi.fn<() => Promise<unknown>>(),
  exchangeCallback: vi.fn<(args: { currentUrl: URL }) => Promise<unknown>>(),
  resolveOidcUser: vi.fn<() => Promise<unknown>>(),
  createSession: vi.fn<() => Promise<void>>(),
  logAuditRequest: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/lib/auth/oidc-config', () => ({ isOidcEnabled, getOidcConfig }))
vi.mock('@/lib/auth/oidc-client', () => ({
  discoverOidc,
  buildStart,
  exchangeCallback,
  // Mirrors the real implementation: the FIXED public callback URL from env.publicUrl.
  oidcRedirectUri: () => 'http://localhost:3000/api/auth/sso/callback',
}))
vi.mock('@/lib/auth/oidc-flow-repo', () => ({ createOidcFlow, consumeOidcFlow }))
vi.mock('@/lib/auth/oidc-account', () => ({ resolveOidcUser }))
vi.mock('@/lib/auth/session', () => ({ createSession }))
vi.mock('@/lib/audit', () => ({ logAuditRequest, logAudit: vi.fn() }))

import { GET as callbackGET } from '@/app/api/auth/sso/callback/route'
import { GET as startGET } from '@/app/api/auth/sso/start/route'

// A request whose origin is the INTERNAL bind (what Caddy proxies to). If a redirect
// were built from req.nextUrl.origin it would carry this host — the bug.
const INTERNAL_ORIGIN = 'http://0.0.0.0:3000'

function req(pathAndQuery: string): NextRequest {
  return new NextRequest(`${INTERNAL_ORIGIN}${pathAndQuery}`)
}

function location(res: Response): URL {
  const loc = res.headers.get('location')
  expect(loc).toBeTruthy()
  return new URL(loc as string)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SSO /start — redirects use PARCHMENT_PUBLIC_URL, not the request origin', () => {
  it('OIDC disabled → /login?sso=unavailable on the public host', async () => {
    isOidcEnabled.mockResolvedValue(false)
    const res = await startGET(req('/api/auth/sso/start'))
    const url = location(res)
    expect(url.host).toBe('localhost:3000')
    expect(url.host).not.toBe('0.0.0.0:3000')
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('sso')).toBe('unavailable')
  })

  it('discovery/build failure → /login?sso=error on the public host', async () => {
    isOidcEnabled.mockResolvedValue(true)
    getOidcConfig.mockResolvedValue({ clientSecret: 's', scopes: 'openid' })
    discoverOidc.mockRejectedValue(new Error('boom'))
    const res = await startGET(req('/api/auth/sso/start'))
    const url = location(res)
    expect(url.host).toBe('localhost:3000')
    expect(url.searchParams.get('sso')).toBe('error')
  })
})

describe('SSO /callback — redirects use PARCHMENT_PUBLIC_URL, not the request origin', () => {
  it('fail() → /login?sso=invalid on the public host', async () => {
    isOidcEnabled.mockResolvedValue(true)
    consumeOidcFlow.mockResolvedValue(null) // forces fail('invalid')
    const res = await callbackGET(req('/api/auth/sso/callback?state=abc'))
    const url = location(res)
    expect(url.host).toBe('localhost:3000')
    expect(url.host).not.toBe('0.0.0.0:3000')
    expect(url.searchParams.get('sso')).toBe('invalid')
  })

  it('successful login → landing redirect on the public host', async () => {
    isOidcEnabled.mockResolvedValue(true)
    consumeOidcFlow.mockResolvedValue({ nonce: 'n', codeVerifier: 'v', redirectTo: '/files' })
    getOidcConfig.mockResolvedValue({ clientSecret: 's' })
    discoverOidc.mockResolvedValue({})
    exchangeCallback.mockResolvedValue({ iss: 'https://idp', sub: 'u' })
    resolveOidcUser.mockResolvedValue({ ok: true, userId: 'u1', outcome: 'login' })
    const res = await callbackGET(req('/api/auth/sso/callback?state=abc&code=xyz'))
    const url = location(res)
    expect(url.host).toBe('localhost:3000')
    expect(url.pathname).toBe('/files')
  })

  // v0.2.11: openid-client derives the token request's redirect_uri from currentUrl,
  // and the IdP requires a byte-match with the registered public value. Behind the
  // TLS-terminating proxy req.url carries the INTERNAL origin, which made every live
  // token exchange fail (invalid_grant → the swallowed catch → "did not complete").
  it('token exchange receives the PUBLIC callback URL with the query preserved, not the internal request origin', async () => {
    isOidcEnabled.mockResolvedValue(true)
    consumeOidcFlow.mockResolvedValue({ nonce: 'n', codeVerifier: 'v', redirectTo: '/' })
    getOidcConfig.mockResolvedValue({ clientSecret: 's' })
    discoverOidc.mockResolvedValue({})
    exchangeCallback.mockResolvedValue({ iss: 'https://idp', sub: 'u' })
    resolveOidcUser.mockResolvedValue({ ok: true, userId: 'u1', outcome: 'login' })

    await callbackGET(req('/api/auth/sso/callback?code=xyz&iss=https%3A%2F%2Fidp&state=abc'))

    expect(exchangeCallback).toHaveBeenCalledTimes(1)
    const arg = exchangeCallback.mock.calls[0]?.[0] as unknown as { currentUrl: URL }
    expect(arg.currentUrl).toBeInstanceOf(URL)
    expect(arg.currentUrl.origin).toBe('http://localhost:3000')
    expect(arg.currentUrl.origin).not.toBe(INTERNAL_ORIGIN)
    expect(arg.currentUrl.pathname).toBe('/api/auth/sso/callback')
    // The IdP's ?code&state&iss must survive the rebuild verbatim.
    expect(arg.currentUrl.searchParams.get('code')).toBe('xyz')
    expect(arg.currentUrl.searchParams.get('state')).toBe('abc')
    expect(arg.currentUrl.searchParams.get('iss')).toBe('https://idp')
  })

  it('exchange failure logs one diagnostic line (name/message only) and redirects sso=invalid', async () => {
    isOidcEnabled.mockResolvedValue(true)
    consumeOidcFlow.mockResolvedValue({ nonce: 'n', codeVerifier: 'v', redirectTo: '/' })
    getOidcConfig.mockResolvedValue({ clientSecret: 's' })
    discoverOidc.mockResolvedValue({})
    const idpError = Object.assign(new Error('unexpected response'), {
      error_description: 'redirect_uri did not match',
    })
    exchangeCallback.mockRejectedValue(idpError)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await callbackGET(req('/api/auth/sso/callback?state=abc&code=xyz'))

    const url = location(res)
    expect(url.searchParams.get('sso')).toBe('invalid')
    expect(spy).toHaveBeenCalledTimes(1)
    const line = String(spy.mock.calls[0]?.[0])
    expect(line).toContain('[sso] callback token exchange failed')
    expect(line).toContain('unexpected response')
    expect(line).toContain('redirect_uri did not match')
    spy.mockRestore()
  })
})
