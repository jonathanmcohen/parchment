// Task 3.1 — unit tests for the OidcConfigForm save handler (injectable fetch, no JSX).
import { describe, expect, it, vi } from 'vitest'
import { saveOidcConfigRequest } from '@/components/settings/OidcConfigForm'

const values = {
  enabled: true,
  issuerUrl: 'https://idp.example.com',
  clientId: 'cid',
  clientSecret: 'secret',
  scopes: 'openid email profile',
}

describe('saveOidcConfigRequest', () => {
  it('PUTs /api/settings/sso with the values and returns ok on success', async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response,
    ) as unknown as typeof fetch
    const r = await saveOidcConfigRequest(values, { fetch: fetchMock })
    expect(r).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/sso', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
  })

  it('surfaces the server error message on failure', async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: false,
          status: 400,
          json: async () => ({ error: 'OIDC discovery failed' }),
        }) as unknown as Response,
    ) as unknown as typeof fetch
    const r = await saveOidcConfigRequest(values, { fetch: fetchMock })
    expect(r).toEqual({ ok: false, error: 'OIDC discovery failed' })
  })

  it('never binds `this` to the deps object', async () => {
    let capturedThis: unknown = 'unset'
    const strictFetch = function (this: unknown): Promise<Response> {
      capturedThis = this
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)
    } as unknown as typeof fetch
    const deps = { fetch: strictFetch }
    await saveOidcConfigRequest(values, deps)
    expect(capturedThis).not.toBe(deps)
  })
})
