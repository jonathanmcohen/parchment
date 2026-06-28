import { beforeEach, describe, expect, it, vi } from 'vitest'

// D-T7 — /api/settings/backup/migrate-token: POST (generate), DELETE (revoke),
// GET (configured?). Admin-only. Stores migrate.tokenHash in app_config.

const {
  authenticateRequest,
  isAdmin,
  generateMigrateToken,
  hashMigrateToken,
  setAppConfig,
  deleteAppConfig,
  getAppConfig,
  logAudit,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn<() => Promise<unknown>>(),
  isAdmin: vi.fn<(u: unknown) => boolean>(),
  generateMigrateToken: vi.fn<() => string>(),
  hashMigrateToken: vi.fn<(t: string) => string>(),
  setAppConfig: vi.fn<(k: string, v: string) => Promise<void>>(),
  deleteAppConfig: vi.fn<(k: string) => Promise<void>>(),
  getAppConfig: vi.fn<(k: string) => Promise<string | null>>(),
  logAudit: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/lib/auth/guard', () => ({ authenticateRequest, isAdmin }))
vi.mock('@/lib/migrate/token', () => ({ generateMigrateToken, hashMigrateToken }))
vi.mock('@/lib/config/repo', () => ({ setAppConfig, deleteAppConfig, getAppConfig }))
vi.mock('@/lib/audit', () => ({ logAudit }))

const ADMIN = { id: 'u1', role: 'admin', email: 'a@p.local' }
const makeReq = () => ({}) as never

beforeEach(() => {
  vi.clearAllMocks()
  isAdmin.mockReturnValue(true)
  authenticateRequest.mockResolvedValue(ADMIN)
  generateMigrateToken.mockReturnValue('plaintext-token-value')
  hashMigrateToken.mockReturnValue('h'.repeat(64))
})

describe('POST /api/settings/backup/migrate-token', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { POST } = await import('@/app/api/settings/backup/migrate-token/route')
    expect((await POST(makeReq())).status).toBe(403)
  })

  it('generates a token, stores the hash, returns the plaintext once', async () => {
    const { POST } = await import('@/app/api/settings/backup/migrate-token/route')
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(setAppConfig).toHaveBeenCalledWith('migrate.tokenHash', 'h'.repeat(64))
    const body = await res.json()
    expect(body.token).toBe('plaintext-token-value')
  })
})

describe('DELETE /api/settings/backup/migrate-token', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { DELETE } = await import('@/app/api/settings/backup/migrate-token/route')
    expect((await DELETE(makeReq())).status).toBe(403)
  })

  it('deletes the stored hash', async () => {
    const { DELETE } = await import('@/app/api/settings/backup/migrate-token/route')
    const res = await DELETE(makeReq())
    expect(res.status).toBe(200)
    expect(deleteAppConfig).toHaveBeenCalledWith('migrate.tokenHash')
    expect((await res.json()).ok).toBe(true)
  })
})

describe('GET /api/settings/backup/migrate-token', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { GET } = await import('@/app/api/settings/backup/migrate-token/route')
    expect((await GET(makeReq())).status).toBe(403)
  })

  it('configured: true when a hash is stored', async () => {
    getAppConfig.mockResolvedValue('h'.repeat(64))
    const { GET } = await import('@/app/api/settings/backup/migrate-token/route')
    const body = await (await GET(makeReq())).json()
    expect(body.configured).toBe(true)
  })

  it('configured: false when no hash is stored', async () => {
    getAppConfig.mockResolvedValue(null)
    const { GET } = await import('@/app/api/settings/backup/migrate-token/route')
    const body = await (await GET(makeReq())).json()
    expect(body.configured).toBe(false)
  })
})
