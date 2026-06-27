import { beforeEach, describe, expect, it, vi } from 'vitest'

// I6: a successful editor rename must invalidate the /files RSC cache (and the
// doc's own page) so the new title shows WITHOUT a manual refresh. These tests
// mock the deps and assert revalidatePath fires only on a real rename.

const { authenticateRequest, getDocument, renameDocument, revalidatePath } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getDocument: vi.fn(),
  renameDocument: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/guard', async () => {
  const { NextResponse } = await import('next/server')
  return {
    authenticateRequest,
    apiAuthFailure: (status: 401 | 403) =>
      NextResponse.json(
        { error: status === 403 ? 'insufficient_scope' : 'unauthorized' },
        { status },
      ),
  }
})
vi.mock('@/lib/docs/repo', () => ({ getDocument, renameDocument }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { POST } from '@/app/api/docs/[id]/rename/route'

const ID = 'doc-123'
function makeReq(body: unknown) {
  return { json: async () => body } as never
}
const params = Promise.resolve({ id: ID })

beforeEach(() => {
  vi.clearAllMocks()
  authenticateRequest.mockResolvedValue({ ok: true, user: { id: 'u1' } })
  getDocument.mockResolvedValue({ id: ID, ownerId: 'u1' })
  renameDocument.mockResolvedValue(undefined)
})

describe('POST /api/docs/[id]/rename — I6 revalidation', () => {
  it('revalidates /files AND the doc page after a successful rename', async () => {
    const res = await POST(makeReq({ title: 'Renamed' }), { params })
    expect(res.status).toBe(200)
    expect(renameDocument).toHaveBeenCalledWith('u1', ID, 'Renamed')
    expect(revalidatePath).toHaveBeenCalledWith('/files')
    expect(revalidatePath).toHaveBeenCalledWith(`/d/${ID}`)
  })

  it('does NOT revalidate when unauthenticated', async () => {
    authenticateRequest.mockResolvedValue({ ok: false, status: 401 })
    const res = await POST(makeReq({ title: 'Renamed' }), { params })
    expect(res.status).toBe(401)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('does NOT revalidate when the doc is not owned by the caller', async () => {
    getDocument.mockResolvedValue({ id: ID, ownerId: 'someone-else' })
    const res = await POST(makeReq({ title: 'Renamed' }), { params })
    expect(res.status).toBe(404)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('does NOT revalidate (or write) on an empty title', async () => {
    const res = await POST(makeReq({ title: '   ' }), { params })
    expect(res.status).toBe(400)
    expect(renameDocument).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
