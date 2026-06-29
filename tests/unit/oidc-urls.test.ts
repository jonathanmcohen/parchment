// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { oidcPostLogoutRedirectUri, oidcRedirectUri } from '@/lib/auth/oidc-client'

// v0.2.2 #3 + #9: the SSO config UI surfaces the callback (redirect_uri) and the
// post-logout redirect URI to register at the IdP. Both are derived from
// PARCHMENT_PUBLIC_URL (tests/setup.ts → http://localhost:3000), never request headers.

describe('OIDC URLs derive from PARCHMENT_PUBLIC_URL', () => {
  it('redirect_uri (callback) is <publicUrl>/api/auth/sso/callback', () => {
    expect(oidcRedirectUri()).toBe('http://localhost:3000/api/auth/sso/callback')
  })

  it('post-logout redirect uri is <publicUrl>/login', () => {
    expect(oidcPostLogoutRedirectUri()).toBe('http://localhost:3000/login')
  })
})
