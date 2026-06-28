import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// D-T5 — POST /api/migrate/push. Source endpoint: builds a backup and POSTs it
// to the target's /api/migrate/receive with a bearer token. https-only target.

const { authenticateRequest, isAdmin, createWorkspaceBackup, logAudit } = vi.hoisted(() => ({
  authenticateRequest: vi.fn<() => Promise<unknown>>(),
  isAdmin: vi.fn<(u: unknown) => boolean>(),
  createWorkspaceBackup: vi.fn<() => Promise<Uint8Array>>(),
  logAudit: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/lib/auth/guard', () => ({ authenticateRequest, isAdmin }))
vi.mock('@/lib/backup/service', () => ({ createWorkspaceBackup }))
vi.mock('@/lib/audit', () => ({ logAudit }))

const ADMIN = { id: 'u1', role: 'admin', email: 'a@p.local' }
const fetchMock = vi.fn<typeof fetch>()

function makeReq(body: Record<string, unknown> | null, dry = false) {
  const url = `https://source.local/api/migrate/push${dry ? '?dry=true' : ''}`
  return {
    nextUrl: new URL(url),
    url,
    json: async () => {
      if (body === null) throw new Error('no body')
      return body
    },
  } as never
}

function jsonResponse(status: number, obj: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  } as unknown as Response
}

beforeEach(() => {
  vi.clearAllMocks()
  isAdmin.mockReturnValue(true)
  authenticateRequest.mockResolvedValue(ADMIN)
  createWorkspaceBackup.mockResolvedValue(new Uint8Array([1, 2, 3]))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/migrate/push', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { POST } = await import('@/app/api/migrate/push/route')
    const res = await POST(makeReq({ targetUrl: 'https://t.local', token: 'x' }))
    expect(res.status).toBe(403)
  })

  it('400 when targetUrl is http:// (reject clear-text token)', async () => {
    const { POST } = await import('@/app/api/migrate/push/route')
    const res = await POST(makeReq({ targetUrl: 'http://t.local', token: 'x' }))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('400 when targetUrl is not a valid URL', async () => {
    const { POST } = await import('@/app/api/migrate/push/route')
    const res = await POST(makeReq({ targetUrl: 'not a url', token: 'x' }))
    expect(res.status).toBe(400)
  })

  it('400 when token is missing', async () => {
    const { POST } = await import('@/app/api/migrate/push/route')
    const res = await POST(makeReq({ targetUrl: 'https://t.local' }))
    expect(res.status).toBe(400)
  })

  it('posts the zip to /api/migrate/receive and returns ok on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { created: 5, skipped: 0, warnings: [] }))
    const { POST } = await import('@/app/api/migrate/push/route')
    const res = await POST(makeReq({ targetUrl: 'https://t.local', token: 'secret' }))
    expect(res.status).toBe(200)
    expect(createWorkspaceBackup).toHaveBeenCalled()
    const [calledUrl, init] = fetchMock.mock.calls[0] ?? []
    expect(String(calledUrl)).toBe('https://t.local/api/migrate/receive')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret')
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.created).toBe(5)
  })

  it('502 on a network error (sanitized)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    const { POST } = await import('@/app/api/migrate/push/route')
    const res = await POST(makeReq({ targetUrl: 'https://t.local', token: 'secret' }))
    expect(res.status).toBe(502)
  })

  it('surfaces a target 4xx as { ok: false, targetStatus }', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: 'forbidden' }))
    const { POST } = await import('@/app/api/migrate/push/route')
    const res = await POST(makeReq({ targetUrl: 'https://t.local', token: 'wrong' }))
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.targetStatus).toBe(403)
  })

  it('?dry=true posts to receive?dry=true and returns the dry-run manifest', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { dryRun: true, wouldCreate: 4, wouldSkip: 0, existingCount: 1 }),
    )
    const { POST } = await import('@/app/api/migrate/push/route')
    const res = await POST(makeReq({ targetUrl: 'https://t.local', token: 'secret' }, true))
    expect(res.status).toBe(200)
    const [calledUrl] = fetchMock.mock.calls[0] ?? []
    expect(String(calledUrl)).toBe('https://t.local/api/migrate/receive?dry=true')
    const body = await res.json()
    expect(body.wouldCreate).toBe(4)
  })
})
