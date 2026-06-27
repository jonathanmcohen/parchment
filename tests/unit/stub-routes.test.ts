// Unit smoke-tests for the I8 501 route stubs (SCIM only — the SSO/oauth 501 stubs
// were REPLACED by G2's real OIDC routes, so this asserts those now exist as GET
// handlers instead). The handlers are thin functions returning a NextResponse — we
// just verify the exported symbols exist; full HTTP-level testing is integration.
import { describe, expect, it } from 'vitest'

describe('OIDC SSO routes (G2 — no longer 501 stubs)', () => {
  it('start + callback export GET handlers; the old 501 sso/oauth stubs are gone', async () => {
    const start = await import('@/app/api/auth/sso/start/route')
    const callback = await import('@/app/api/auth/sso/callback/route')
    expect(typeof start.GET).toBe('function')
    expect(typeof callback.GET).toBe('function')
    // The retired stubs must not resolve any more. A computed specifier keeps TS from
    // statically resolving (and erroring on) the now-deleted module paths.
    const gone = (p: string) => import(/* @vite-ignore */ p)
    await expect(gone('@/app/api/auth/sso/route')).rejects.toThrow()
    await expect(gone('@/app/api/auth/oauth/route')).rejects.toThrow()
  })
})

describe('SCIM Users route stub (I8)', () => {
  it('exports GET and POST', async () => {
    const mod = await import('@/app/api/scim/v2/Users/route')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.POST).toBe('function')
  })
})

describe('SCIM Groups route stub (I8)', () => {
  it('exports GET and POST', async () => {
    const mod = await import('@/app/api/scim/v2/Groups/route')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.POST).toBe('function')
  })
})
