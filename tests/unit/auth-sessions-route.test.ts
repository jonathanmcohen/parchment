import { beforeEach, describe, expect, it, vi } from 'vitest'

// Route-handler tests for GET /api/auth/sessions. The repo is mocked so the test
// stays unit-level; it verifies the auth gate, the session-only (no-Bearer) rule,
// and that the response shape carries no token hash.

const { authenticateRequest, listUserSessions } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  listUserSessions: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({ authenticateRequest }))
vi.mock('@/lib/auth/sessions-repo', () => ({ listUserSessions }))

import { GET } from '@/app/api/auth/sessions/route'

function makeReq({ bearer = false }: { bearer?: boolean } = {}) {
  return {
    headers: { get: (k: string) => (bearer && k === 'authorization' ? 'Bearer pat_x' : null) },
  } as never
}

const SESSIONS = [
  {
    id: 's1',
    createdAt: '2026-06-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    current: true,
  },
  {
    id: 's2',
    createdAt: '2026-05-01T00:00:00.000Z',
    expiresAt: '2026-06-30T00:00:00.000Z',
    current: false,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  authenticateRequest.mockResolvedValue({ id: 'u1' })
  listUserSessions.mockResolvedValue(SESSIONS)
})

describe('GET /api/auth/sessions — auth gate', () => {
  it('401 when unauthenticated', async () => {
    authenticateRequest.mockResolvedValue(null)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
    expect(listUserSessions).not.toHaveBeenCalled()
  })

  it('401 for a Bearer (PAT) request — session-only', async () => {
    const res = await GET(makeReq({ bearer: true }))
    expect(res.status).toBe(401)
    expect(authenticateRequest).not.toHaveBeenCalled()
  })
})

describe('GET /api/auth/sessions — happy path', () => {
  it('returns the caller sessions and marks exactly one as current', async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { sessions: typeof SESSIONS }
    expect(listUserSessions).toHaveBeenCalledWith('u1')
    expect(body.sessions).toHaveLength(2)
    expect(body.sessions.filter((s) => s.current)).toHaveLength(1)
  })

  it('never includes a token hash in the response', async () => {
    const res = await GET(makeReq())
    const text = JSON.stringify(await res.json())
    expect(text.toLowerCase()).not.toContain('tokenhash')
    expect(text.toLowerCase()).not.toContain('token_hash')
  })
})
