// F7: unit tests for the workspace-name setting.
//   • normalizeWorkspaceName — the pure validation rule (no DB).
//   • GET/PUT /api/settings/workspace — the route handlers, with auth and the
//     settings-repo mocked (no DB, no network). The route imports server-only
//     modules (drizzle via settings-repo), so we mock those deps.
import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_WORKSPACE_NAME,
  MAX_WORKSPACE_NAME_LEN,
  normalizeWorkspaceName,
} from '@/lib/docs/workspace-config'

describe('F7 — normalizeWorkspaceName', () => {
  it('coerces non-strings to the empty default', () => {
    expect(normalizeWorkspaceName(undefined)).toBe(DEFAULT_WORKSPACE_NAME)
    expect(normalizeWorkspaceName(null)).toBe('')
    expect(normalizeWorkspaceName(42)).toBe('')
    expect(normalizeWorkspaceName({})).toBe('')
  })

  it('trims surrounding whitespace and collapses internal runs', () => {
    expect(normalizeWorkspaceName('  My  Team   Space  ')).toBe('My Team Space')
    expect(normalizeWorkspaceName('\t\nAcme\n\t')).toBe('Acme')
  })

  it('caps the length at MAX_WORKSPACE_NAME_LEN', () => {
    const long = 'x'.repeat(MAX_WORKSPACE_NAME_LEN + 50)
    expect(normalizeWorkspaceName(long)).toHaveLength(MAX_WORKSPACE_NAME_LEN)
  })

  it('leaves a clean name unchanged', () => {
    expect(normalizeWorkspaceName('Parchment HQ')).toBe('Parchment HQ')
  })
})

// ── Route handlers ────────────────────────────────────────────────────────────

const authenticateRequest = vi.fn()
const getWorkspaceName = vi.fn()
const setWorkspaceName = vi.fn()

vi.mock('@/lib/auth/guard', () => ({
  authenticateRequest: (req: NextRequest) => authenticateRequest(req),
}))
vi.mock('@/lib/docs/settings-repo', () => ({
  getWorkspaceName: (id: string) => getWorkspaceName(id),
  setWorkspaceName: (id: string, name: unknown) => setWorkspaceName(id, name),
}))

/** Minimal NextRequest stand-in carrying an optional JSON body. */
function makeReq(body?: unknown): NextRequest {
  return {
    json: async () => {
      if (body === undefined) throw new Error('no body')
      return body
    },
  } as unknown as NextRequest
}

describe('F7 — GET/PUT /api/settings/workspace', () => {
  beforeEach(() => {
    authenticateRequest.mockReset()
    getWorkspaceName.mockReset()
    setWorkspaceName.mockReset()
  })

  it('GET returns 401 when unauthenticated', async () => {
    authenticateRequest.mockResolvedValue(null)
    const { GET } = await import('@/app/api/settings/workspace/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
    expect(getWorkspaceName).not.toHaveBeenCalled()
  })

  it('GET returns the stored name for the authenticated owner', async () => {
    authenticateRequest.mockResolvedValue({ id: 'owner-1' })
    getWorkspaceName.mockResolvedValue('Acme Docs')
    const { GET } = await import('@/app/api/settings/workspace/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: 'Acme Docs' })
    expect(getWorkspaceName).toHaveBeenCalledWith('owner-1')
  })

  it('PUT returns 401 when unauthenticated', async () => {
    authenticateRequest.mockResolvedValue(null)
    const { PUT } = await import('@/app/api/settings/workspace/route')
    const res = await PUT(makeReq({ name: 'x' }))
    expect(res.status).toBe(401)
    expect(setWorkspaceName).not.toHaveBeenCalled()
  })

  it('PUT rejects a non-string name with 400', async () => {
    authenticateRequest.mockResolvedValue({ id: 'owner-1' })
    const { PUT } = await import('@/app/api/settings/workspace/route')
    const res = await PUT(makeReq({ name: 123 }))
    expect(res.status).toBe(400)
    expect(setWorkspaceName).not.toHaveBeenCalled()
  })

  it('PUT rejects a missing/invalid JSON body with 400', async () => {
    authenticateRequest.mockResolvedValue({ id: 'owner-1' })
    const { PUT } = await import('@/app/api/settings/workspace/route')
    const res = await PUT(makeReq())
    expect(res.status).toBe(400)
    expect(setWorkspaceName).not.toHaveBeenCalled()
  })

  it('PUT persists the name and echoes the normalized stored value', async () => {
    authenticateRequest.mockResolvedValue({ id: 'owner-1' })
    setWorkspaceName.mockResolvedValue('My Team')
    const { PUT } = await import('@/app/api/settings/workspace/route')
    const res = await PUT(makeReq({ name: '  My   Team  ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, name: 'My Team' })
    expect(setWorkspaceName).toHaveBeenCalledWith('owner-1', '  My   Team  ')
  })
})
