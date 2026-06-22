// Unit smoke-tests for the I8 501 route stubs.
// The handlers are thin functions that return a NextResponse — we just verify
// the exported symbols exist and are callable. Full HTTP-level testing is an
// integration concern (excluded from this suite).
import { describe, expect, it } from 'vitest'

describe('SSO route stub (I8)', () => {
  it('exports GET and POST', async () => {
    const mod = await import('@/app/api/auth/sso/route')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.POST).toBe('function')
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
