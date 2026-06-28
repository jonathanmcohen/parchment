import { beforeEach, describe, expect, it, vi } from 'vitest'

// D-T3 — POST /api/migrate/receive. Authenticated ONLY by the encrypted
// MIGRATE_TOKEN bearer (no user session). Writes via restoreWorkspaceBackup.
// Dry-run returns a manifest diff WITHOUT writing.

const {
  getAppConfig,
  verifyMigrateToken,
  restoreWorkspaceBackup,
  parseWorkspaceBackup,
  getFirstAdminUser,
  countDocuments,
  logAudit,
} = vi.hoisted(() => ({
  getAppConfig: vi.fn<(k: string) => Promise<string | null>>(),
  verifyMigrateToken: vi.fn<(a: string, b: string) => boolean>(),
  restoreWorkspaceBackup: vi.fn<() => Promise<unknown>>(),
  parseWorkspaceBackup: vi.fn<() => Promise<unknown>>(),
  getFirstAdminUser: vi.fn<() => Promise<{ id: string } | null>>(),
  countDocuments: vi.fn<(ownerId: string) => Promise<number>>(),
  logAudit: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/lib/config/repo', () => ({ getAppConfig }))
vi.mock('@/lib/migrate/token', () => ({ verifyMigrateToken }))
vi.mock('@/lib/backup/service', () => ({ restoreWorkspaceBackup, parseWorkspaceBackup }))
vi.mock('@/lib/migrate/admin', () => ({ getFirstAdminUser, countDocuments }))
vi.mock('@/lib/audit', () => ({ logAudit }))

const STORED_HASH = 'a'.repeat(64)
const PK_ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])

function makeReq(opts: {
  auth?: string
  bytes?: Uint8Array
  dry?: boolean
  contentLength?: string
}) {
  const url = `https://target.local/api/migrate/receive${opts.dry ? '?dry=true' : ''}`
  const headers = new Map<string, string>()
  if (opts.auth) headers.set('authorization', opts.auth)
  if (opts.contentLength) headers.set('content-length', opts.contentLength)
  return {
    nextUrl: new URL(url),
    url,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    arrayBuffer: async () => (opts.bytes ?? PK_ZIP).buffer,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  getAppConfig.mockResolvedValue(STORED_HASH)
  verifyMigrateToken.mockReturnValue(true)
  getFirstAdminUser.mockResolvedValue({ id: 'admin-1' })
  countDocuments.mockResolvedValue(3)
  restoreWorkspaceBackup.mockResolvedValue({ created: 2, skipped: 1, warnings: [] })
  parseWorkspaceBackup.mockResolvedValue({
    manifest: { docCount: 2 },
    entries: [{ meta: {} }, { meta: {} }],
    warnings: [],
  })
})

describe('POST /api/migrate/receive — auth', () => {
  it('401 with no Authorization header', async () => {
    const { POST } = await import('@/app/api/migrate/receive/route')
    const res = await POST(makeReq({}))
    expect(res.status).toBe(401)
  })

  it('401 when no token is configured on the target', async () => {
    getAppConfig.mockResolvedValue(null)
    const { POST } = await import('@/app/api/migrate/receive/route')
    const res = await POST(makeReq({ auth: 'Bearer something' }))
    expect(res.status).toBe(401)
  })

  it('403 when the bearer token does not match', async () => {
    verifyMigrateToken.mockReturnValue(false)
    const { POST } = await import('@/app/api/migrate/receive/route')
    const res = await POST(makeReq({ auth: 'Bearer wrong' }))
    expect(res.status).toBe(403)
    expect(restoreWorkspaceBackup).not.toHaveBeenCalled()
  })
})

describe('POST /api/migrate/receive — restore', () => {
  it('valid token + valid zip → restoreWorkspaceBackup + result', async () => {
    const { POST } = await import('@/app/api/migrate/receive/route')
    const res = await POST(makeReq({ auth: 'Bearer good' }))
    expect(res.status).toBe(200)
    expect(restoreWorkspaceBackup).toHaveBeenCalledWith('admin-1', expect.any(Uint8Array))
    const body = await res.json()
    expect(body).toEqual({ created: 2, skipped: 1, warnings: [] })
    expect(logAudit).toHaveBeenCalled()
  })

  it('malformed zip → 400', async () => {
    restoreWorkspaceBackup.mockRejectedValue(new Error('Not a backup: not a ZIP'))
    const { POST } = await import('@/app/api/migrate/receive/route')
    const res = await POST(makeReq({ auth: 'Bearer good' }))
    expect(res.status).toBe(400)
  })

  it('413 when the body exceeds the size cap (content-length)', async () => {
    const { POST } = await import('@/app/api/migrate/receive/route')
    const res = await POST(
      makeReq({ auth: 'Bearer good', contentLength: String(200 * 1024 * 1024) }),
    )
    expect(res.status).toBe(413)
    expect(restoreWorkspaceBackup).not.toHaveBeenCalled()
  })
})

describe('POST /api/migrate/receive — dry run', () => {
  it('?dry=true returns a manifest diff WITHOUT writing', async () => {
    const { POST } = await import('@/app/api/migrate/receive/route')
    const res = await POST(makeReq({ auth: 'Bearer good', dry: true }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(true)
    expect(body.wouldCreate).toBe(2)
    expect(body.existingCount).toBe(3)
    expect(restoreWorkspaceBackup).not.toHaveBeenCalled()
    expect(parseWorkspaceBackup).toHaveBeenCalled()
  })

  it('dry run with a malformed zip → 400', async () => {
    parseWorkspaceBackup.mockRejectedValue(new Error('Not a backup'))
    const { POST } = await import('@/app/api/migrate/receive/route')
    const res = await POST(makeReq({ auth: 'Bearer good', dry: true }))
    expect(res.status).toBe(400)
  })
})
