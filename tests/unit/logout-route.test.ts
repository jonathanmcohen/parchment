import { beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.2 #9: logout always destroys the local session, and ALSO returns an IdP
// end-session redirect when the user has an OIDC identity, OIDC is enabled, and the
// IdP advertises end_session. Otherwise it is a plain local logout (no redirectTo).

const {
  getCurrentUser,
  destroySession,
  userHasOidcIdentity,
  isOidcEnabled,
  getOidcConfig,
  discoverOidc,
  buildEndSessionRedirect,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<unknown>>(),
  destroySession: vi.fn<() => Promise<void>>(),
  userHasOidcIdentity: vi.fn<() => Promise<boolean>>(),
  isOidcEnabled: vi.fn<() => Promise<boolean>>(),
  getOidcConfig: vi.fn<() => Promise<unknown>>(),
  discoverOidc: vi.fn<() => Promise<unknown>>(),
  buildEndSessionRedirect: vi.fn<() => string | null>(),
}))

vi.mock('@/lib/auth/session', () => ({ getCurrentUser, destroySession }))
vi.mock('@/lib/auth/oidc-account', () => ({ userHasOidcIdentity }))
vi.mock('@/lib/auth/oidc-config', () => ({ isOidcEnabled, getOidcConfig }))
vi.mock('@/lib/auth/oidc-client', () => ({ discoverOidc, buildEndSessionRedirect }))

import { POST } from '@/app/api/auth/logout/route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/auth/logout', () => {
  it('local-only logout when the user has no OIDC identity (no redirectTo)', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' })
    userHasOidcIdentity.mockResolvedValue(false)
    const res = await POST()
    const body = await res.json()
    expect(destroySession).toHaveBeenCalledTimes(1)
    expect(body.ok).toBe(true)
    expect(body.redirectTo).toBeUndefined()
    // We never reach discovery for a non-OIDC user.
    expect(discoverOidc).not.toHaveBeenCalled()
  })

  it('returns the IdP end-session URL for an OIDC user when end_session is advertised', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' })
    userHasOidcIdentity.mockResolvedValue(true)
    isOidcEnabled.mockResolvedValue(true)
    getOidcConfig.mockResolvedValue({ issuerUrl: 'https://idp', clientId: 'c' })
    discoverOidc.mockResolvedValue({})
    buildEndSessionRedirect.mockReturnValue('https://idp/logout?x=1')
    const res = await POST()
    const body = await res.json()
    expect(body.redirectTo).toBe('https://idp/logout?x=1')
    expect(destroySession).toHaveBeenCalledTimes(1)
  })

  it('falls back to local logout when the IdP does not advertise end_session', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' })
    userHasOidcIdentity.mockResolvedValue(true)
    isOidcEnabled.mockResolvedValue(true)
    getOidcConfig.mockResolvedValue({ issuerUrl: 'https://idp', clientId: 'c' })
    discoverOidc.mockResolvedValue({})
    buildEndSessionRedirect.mockReturnValue(null) // no end_session_endpoint
    const res = await POST()
    const body = await res.json()
    expect(body.redirectTo).toBeUndefined()
    expect(destroySession).toHaveBeenCalledTimes(1)
  })

  it('still destroys the session if OIDC discovery throws', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' })
    userHasOidcIdentity.mockResolvedValue(true)
    isOidcEnabled.mockResolvedValue(true)
    getOidcConfig.mockResolvedValue({ issuerUrl: 'https://idp', clientId: 'c' })
    discoverOidc.mockRejectedValue(new Error('discovery down'))
    const res = await POST()
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.redirectTo).toBeUndefined()
    expect(destroySession).toHaveBeenCalledTimes(1)
  })

  it('still destroys the session for an anonymous logout (no current user)', async () => {
    getCurrentUser.mockResolvedValue(null)
    const res = await POST()
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(destroySession).toHaveBeenCalledTimes(1)
    expect(userHasOidcIdentity).not.toHaveBeenCalled()
  })
})
