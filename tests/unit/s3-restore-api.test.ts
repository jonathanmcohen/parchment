import { beforeEach, describe, expect, it, vi } from 'vitest'

// F1-T7 — POST /api/settings/backup/s3/restore { key }.
// Admin-only; fetches the object from S3 (GetObjectCommand, mocked) and feeds
// the bytes to restoreWorkspaceBackup. Path-traversal keys → 400. S3 fetch
// failure → 502 (sanitized).

const {
  authenticateRequest,
  isAdmin,
  resolveS3Config,
  restoreWorkspaceBackup,
  restoreWorkspaceBackupSelective,
  s3Send,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn<() => Promise<unknown>>(),
  isAdmin: vi.fn<(u: unknown) => boolean>(),
  resolveS3Config: vi.fn<() => Promise<unknown>>(),
  restoreWorkspaceBackup: vi.fn<() => Promise<unknown>>(),
  restoreWorkspaceBackupSelective: vi.fn<() => Promise<unknown>>(),
  s3Send: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('@/lib/auth/guard', () => ({ authenticateRequest, isAdmin }))
vi.mock('@/lib/backup/s3-config', () => ({ resolveS3Config }))
vi.mock('@/lib/backup/service', () => ({
  restoreWorkspaceBackup,
  restoreWorkspaceBackupSelective,
}))
vi.mock('@aws-sdk/client-s3', () => ({
  // Must be `new`-able — use a class, not an arrow (arrows can't be constructed).
  S3Client: class {
    send = s3Send
  },
  GetObjectCommand: class {
    constructor(args: Record<string, unknown>) {
      Object.assign(this, args)
    }
  },
}))

const ADMIN = { id: 'u1', role: 'admin', email: 'a@p.local' }
const PK_ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])

function makeReq(body: Record<string, unknown> | null) {
  return {
    json: async () => {
      if (body === null) throw new Error('no body')
      return body
    },
  } as unknown as Request
}

beforeEach(() => {
  vi.clearAllMocks()
  isAdmin.mockReturnValue(true)
  authenticateRequest.mockResolvedValue(ADMIN)
  resolveS3Config.mockResolvedValue({
    endpoint: 'https://minio:9000',
    bucket: 'parchment',
    accessKeyId: 'AKIA',
    secretAccessKey: 'shh',
    region: 'us-east-1',
    prefix: '',
    scheduleHours: 24,
    enabled: true,
  })
  // GetObject returns a Body with transformToByteArray (AWS SDK v3 shape).
  s3Send.mockResolvedValue({
    Body: { transformToByteArray: async () => PK_ZIP },
  })
  restoreWorkspaceBackup.mockResolvedValue({ created: 2, skipped: 0, warnings: [] })
})

describe('POST /api/settings/backup/s3/restore', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { POST } = await import('@/app/api/settings/backup/s3/restore/route')
    const res = await POST(makeReq({ key: 'parchment-backup-x.zip' }) as never)
    expect(res.status).toBe(403)
  })

  it('fetches the object and calls restoreWorkspaceBackup', async () => {
    const { POST } = await import('@/app/api/settings/backup/s3/restore/route')
    const res = await POST(makeReq({ key: 'parchment-backup-x.zip' }) as never)
    expect(res.status).toBe(200)
    expect(s3Send).toHaveBeenCalledOnce()
    expect(restoreWorkspaceBackup).toHaveBeenCalledWith('u1', PK_ZIP)
    const body = await res.json()
    expect(body).toEqual({ created: 2, skipped: 0, warnings: [] })
  })

  it('400 when the key contains ".."', async () => {
    const { POST } = await import('@/app/api/settings/backup/s3/restore/route')
    const res = await POST(makeReq({ key: '../etc/passwd' }) as never)
    expect(res.status).toBe(400)
    expect(s3Send).not.toHaveBeenCalled()
  })

  it('400 when the key starts with "/"', async () => {
    const { POST } = await import('@/app/api/settings/backup/s3/restore/route')
    const res = await POST(makeReq({ key: '/abs/key.zip' }) as never)
    expect(res.status).toBe(400)
  })

  it('502 when the S3 fetch fails', async () => {
    s3Send.mockRejectedValue(new Error('connection refused'))
    const { POST } = await import('@/app/api/settings/backup/s3/restore/route')
    const res = await POST(makeReq({ key: 'parchment-backup-x.zip' }) as never)
    expect(res.status).toBe(502)
  })

  it('400 when key is missing', async () => {
    const { POST } = await import('@/app/api/settings/backup/s3/restore/route')
    const res = await POST(makeReq({}) as never)
    expect(res.status).toBe(400)
  })
})
