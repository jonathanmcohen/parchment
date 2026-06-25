import { beforeEach, describe, expect, it, vi } from 'vitest'

// Route-handler tests for PUT /api/settings/profile (V2). DB + guard are mocked
// so this is a fast unit test (no Postgres) while exercising the auth gate, body
// validation, trimming, and the persist path.

const { authenticateRequest, dbUpdateSet, dbUpdateWhere } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  dbUpdateSet: vi.fn(),
  dbUpdateWhere: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({ authenticateRequest }))
vi.mock('@/db', () => ({
  schema: { users: { id: 'users.id' } },
  db: {
    update: () => ({
      set: (...args: unknown[]) => {
        dbUpdateSet(...args)
        return { where: (...w: unknown[]) => dbUpdateWhere(...w) }
      },
    }),
  },
}))

import { PUT } from '@/app/api/settings/profile/route'

function makeReq(body: unknown) {
  return {
    json: async () => {
      if (body === undefined) throw new Error('no body')
      return body
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  authenticateRequest.mockResolvedValue({ id: 'u1', name: 'Old Name', email: 'u@x.dev' })
})

describe('PUT /api/settings/profile', () => {
  it('401 when unauthenticated (no write)', async () => {
    authenticateRequest.mockResolvedValue(null)
    const res = await PUT(makeReq({ name: 'New' }))
    expect(res.status).toBe(401)
    expect(dbUpdateSet).not.toHaveBeenCalled()
  })

  it('400 invalid_body when name is missing or not a string', async () => {
    expect((await PUT(makeReq({}))).status).toBe(400)
    expect((await PUT(makeReq({ name: 42 }))).status).toBe(400)
    expect((await PUT(makeReq(undefined))).status).toBe(400) // unparseable JSON
    expect(dbUpdateSet).not.toHaveBeenCalled()
  })

  it('400 name_required when the name is empty or whitespace-only', async () => {
    const res = await PUT(makeReq({ name: '   ' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'name_required' })
    expect(dbUpdateSet).not.toHaveBeenCalled()
  })

  it('400 name_too_long over the length cap', async () => {
    const res = await PUT(makeReq({ name: 'x'.repeat(101) }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'name_too_long' })
    expect(dbUpdateSet).not.toHaveBeenCalled()
  })

  it('200 persists the TRIMMED name for the authenticated user', async () => {
    const res = await PUT(makeReq({ name: '  Jonathan Cohen  ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: 'Jonathan Cohen' })
    expect(dbUpdateSet).toHaveBeenCalledWith({ name: 'Jonathan Cohen' })
    expect(dbUpdateWhere).toHaveBeenCalledTimes(1)
  })
})
