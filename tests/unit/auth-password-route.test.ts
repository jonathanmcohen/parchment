import { beforeEach, describe, expect, it, vi } from 'vitest'

// Route-handler tests for POST /api/auth/password. All DB/crypto/guard deps are
// mocked so this stays a fast unit test (no Postgres) while still exercising the
// auth gate, body validation, the current-password verify, and the persist path.

const { authenticateRequest, verifyPassword, hashPassword, dbUpdateSet, dbUpdateWhere } =
  vi.hoisted(() => ({
    authenticateRequest: vi.fn(),
    verifyPassword: vi.fn(),
    hashPassword: vi.fn(),
    dbUpdateSet: vi.fn(),
    dbUpdateWhere: vi.fn(),
  }))

vi.mock('@/lib/auth/guard', () => ({ authenticateRequest }))
vi.mock('@/lib/auth/password', () => ({ verifyPassword, hashPassword }))
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

import { POST } from '@/app/api/auth/password/route'

type Body = Record<string, unknown> | null

function makeReq(body: Body, { bearer = false }: { bearer?: boolean } = {}) {
  return {
    headers: { get: (k: string) => (bearer && k === 'authorization' ? 'Bearer pat_x' : null) },
    json: async () => {
      if (body === null) throw new Error('no body')
      return body
    },
  } as never
}

const USER = { id: 'u1', passwordHash: 'argon2-stored-hash' }

beforeEach(() => {
  vi.clearAllMocks()
  authenticateRequest.mockResolvedValue(USER)
  verifyPassword.mockResolvedValue(true)
  hashPassword.mockResolvedValue('argon2-new-hash')
})

describe('POST /api/auth/password — auth gate', () => {
  it('401 when there is no authenticated session', async () => {
    authenticateRequest.mockResolvedValue(null)
    const res = await POST(makeReq({ currentPassword: 'oldpass12', newPassword: 'newpass12' }))
    expect(res.status).toBe(401)
  })

  it('401 for a Bearer (PAT) request — session-only, never authenticateRequest', async () => {
    const res = await POST(
      makeReq({ currentPassword: 'oldpass12', newPassword: 'newpass12' }, { bearer: true }),
    )
    expect(res.status).toBe(401)
    expect(authenticateRequest).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/password — validation', () => {
  it('400 invalid_body when fields are missing', async () => {
    const res = await POST(makeReq({ currentPassword: 'oldpass12' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body' })
  })

  it('400 invalid_body when the JSON body cannot be parsed', async () => {
    const res = await POST(makeReq(null))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body' })
  })

  it('400 password_too_short when newPassword is under the minimum', async () => {
    const res = await POST(makeReq({ currentPassword: 'oldpass12', newPassword: 'short' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'password_too_short' })
    expect(verifyPassword).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/password — current-password verify', () => {
  it('400 invalid_current_password when verify fails (no DB write)', async () => {
    verifyPassword.mockResolvedValue(false)
    const res = await POST(makeReq({ currentPassword: 'wrongpass', newPassword: 'newpass12' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_current_password' })
    expect(hashPassword).not.toHaveBeenCalled()
    expect(dbUpdateSet).not.toHaveBeenCalled()
  })

  it('409 no_password_set when the account has no stored hash', async () => {
    authenticateRequest.mockResolvedValue({ id: 'u1', passwordHash: null })
    const res = await POST(makeReq({ currentPassword: 'whatever1', newPassword: 'newpass12' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'no_password_set' })
  })

  it('verifies against the STORED hash, then hashes + persists the new password', async () => {
    const res = await POST(makeReq({ currentPassword: 'oldpass12', newPassword: 'newpass12' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(verifyPassword).toHaveBeenCalledWith('argon2-stored-hash', 'oldpass12')
    expect(hashPassword).toHaveBeenCalledWith('newpass12')
    expect(dbUpdateSet).toHaveBeenCalledWith({ passwordHash: 'argon2-new-hash' })
    expect(dbUpdateWhere).toHaveBeenCalledTimes(1)
  })

  it('never leaks a hash in the response body', async () => {
    const res = await POST(makeReq({ currentPassword: 'oldpass12', newPassword: 'newpass12' }))
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain('argon2')
  })
})
