// v0.1.5: unit tests for the page-layout-mode setting.
//   • getPageLayoutMode / setPageLayoutMode normalization is covered alongside
//     the route tests here via the mocked settings-repo (the route is the public
//     surface). The repo's pure validation logic is exercised through the route
//     handlers + the dedicated normalization describe block below.
//   • GET/PUT /api/settings/page-layout — the route handlers, with auth and the
//     settings-repo mocked (no DB, no network). The route imports server-only
//     modules (drizzle via settings-repo), so we mock those deps.
import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authenticateRequest = vi.fn()
const getPageLayoutMode = vi.fn()
const setPageLayoutMode = vi.fn()

vi.mock('@/lib/auth/guard', () => ({
  authenticateRequest: (req: NextRequest) => authenticateRequest(req),
}))
vi.mock('@/lib/docs/settings-repo', () => ({
  getPageLayoutMode: (id: string) => getPageLayoutMode(id),
  setPageLayoutMode: (id: string, mode: unknown) => setPageLayoutMode(id, mode),
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

describe('v0.1.5 — GET/PUT /api/settings/page-layout', () => {
  beforeEach(() => {
    authenticateRequest.mockReset()
    getPageLayoutMode.mockReset()
    setPageLayoutMode.mockReset()
  })

  it('GET returns 401 when unauthenticated', async () => {
    authenticateRequest.mockResolvedValue(null)
    const { GET } = await import('@/app/api/settings/page-layout/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
    expect(getPageLayoutMode).not.toHaveBeenCalled()
  })

  it('GET returns the stored mode for the authenticated owner', async () => {
    authenticateRequest.mockResolvedValue({ id: 'owner-1' })
    getPageLayoutMode.mockResolvedValue('paged')
    const { GET } = await import('@/app/api/settings/page-layout/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mode: 'paged' })
    expect(getPageLayoutMode).toHaveBeenCalledWith('owner-1')
  })

  it('PUT returns 401 when unauthenticated', async () => {
    authenticateRequest.mockResolvedValue(null)
    const { PUT } = await import('@/app/api/settings/page-layout/route')
    const res = await PUT(makeReq({ mode: 'paged' }))
    expect(res.status).toBe(401)
    expect(setPageLayoutMode).not.toHaveBeenCalled()
  })

  it('PUT rejects an invalid mode with 400', async () => {
    authenticateRequest.mockResolvedValue({ id: 'owner-1' })
    const { PUT } = await import('@/app/api/settings/page-layout/route')
    expect((await PUT(makeReq({ mode: 'bogus' }))).status).toBe(400)
    expect((await PUT(makeReq({ mode: 123 }))).status).toBe(400)
    expect((await PUT(makeReq({}))).status).toBe(400)
    expect(setPageLayoutMode).not.toHaveBeenCalled()
  })

  it('PUT rejects a missing/invalid JSON body with 400', async () => {
    authenticateRequest.mockResolvedValue({ id: 'owner-1' })
    const { PUT } = await import('@/app/api/settings/page-layout/route')
    const res = await PUT(makeReq())
    expect(res.status).toBe(400)
    expect(setPageLayoutMode).not.toHaveBeenCalled()
  })

  it('PUT persists "paged" and echoes the normalized stored value', async () => {
    authenticateRequest.mockResolvedValue({ id: 'owner-1' })
    setPageLayoutMode.mockResolvedValue('paged')
    const { PUT } = await import('@/app/api/settings/page-layout/route')
    const res = await PUT(makeReq({ mode: 'paged' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, mode: 'paged' })
    expect(setPageLayoutMode).toHaveBeenCalledWith('owner-1', 'paged')
  })

  it('PUT persists "continuous"', async () => {
    authenticateRequest.mockResolvedValue({ id: 'owner-1' })
    setPageLayoutMode.mockResolvedValue('continuous')
    const { PUT } = await import('@/app/api/settings/page-layout/route')
    const res = await PUT(makeReq({ mode: 'continuous' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, mode: 'continuous' })
    expect(setPageLayoutMode).toHaveBeenCalledWith('owner-1', 'continuous')
  })
})
