// §6.2 — unit tests for the SessionsList revoke handler (no JSX; injectable fetch,
// mirroring the account-theme-handler convention). Asserts it DELETEs the right URL,
// reports ok/!ok with the status, and never binds `this` to the deps object.
import { describe, expect, it, vi } from 'vitest'
import { revokeSessionRequest } from '@/components/settings/SessionsList'

describe('revokeSessionRequest', () => {
  it('DELETEs /api/auth/sessions/<id> and returns { ok: true } on success', async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: true, status: 200 }) as Response,
    ) as unknown as typeof fetch
    const result = await revokeSessionRequest('sess-123', { fetch: fetchMock })
    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/sessions/sess-123', { method: 'DELETE' })
  })

  it('returns { ok: false, status } on a non-2xx response', async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: false, status: 404 }) as Response,
    ) as unknown as typeof fetch
    const result = await revokeSessionRequest('missing', { fetch: fetchMock })
    expect(result).toEqual({ ok: false, status: 404 })
  })

  it('does NOT invoke fetch with `this` bound to the deps object (Illegal invocation guard)', async () => {
    let capturedThis: unknown = 'unset'
    const strictFetch = function (this: unknown): Promise<Response> {
      capturedThis = this
      return Promise.resolve({ ok: true, status: 200 } as Response)
    } as unknown as typeof fetch
    const deps = { fetch: strictFetch }
    await revokeSessionRequest('x', deps)
    expect(capturedThis).not.toBe(deps)
    expect(capturedThis).toBeUndefined()
  })

  it('url-encodes the session id', async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: true, status: 200 }) as Response,
    ) as unknown as typeof fetch
    await revokeSessionRequest('a/b id', { fetch: fetchMock })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/sessions/a%2Fb%20id', { method: 'DELETE' })
  })
})
