import { beforeEach, describe, expect, it, vi } from 'vitest'

// F1-T5 — GET/PUT /api/settings/backup/s3 + POST /api/settings/backup/s3/test.
// All deps mocked: auth guard, the s3-config module, the scheduler singleton.

const {
  authenticateRequest,
  isAdmin,
  resolveS3Config,
  saveS3Config,
  testS3Connection,
  reconfigureS3Job,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn<() => Promise<unknown>>(),
  isAdmin: vi.fn<(u: unknown) => boolean>(),
  resolveS3Config: vi.fn<() => Promise<unknown>>(),
  saveS3Config: vi.fn<(cfg: { secretAccessKey?: string }) => Promise<void>>(),
  testS3Connection: vi.fn<() => Promise<unknown>>(),
  reconfigureS3Job: vi.fn<(enabled: boolean) => void>(),
}))

vi.mock('@/lib/auth/guard', () => ({ authenticateRequest, isAdmin }))
vi.mock('@/lib/backup/s3-config', () => ({
  resolveS3Config,
  saveS3Config,
  testS3Connection,
}))
vi.mock('@/lib/schedules/scheduler', () => ({ scheduler: { reconfigureS3Job } }))

const SECRET_MASK = '••••••••'
const ADMIN = { id: 'u1', role: 'admin', email: 'a@p.local' }

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
})

describe('GET /api/settings/backup/s3', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    authenticateRequest.mockResolvedValue({ id: 'u2', role: 'editor' })
    const { GET } = await import('@/app/api/settings/backup/s3/route')
    const res = await GET(makeReq({}) as never)
    expect(res.status).toBe(403)
  })

  it('401 when unauthenticated', async () => {
    authenticateRequest.mockResolvedValue(null)
    const { GET } = await import('@/app/api/settings/backup/s3/route')
    const res = await GET(makeReq({}) as never)
    expect(res.status).toBe(401)
  })

  it('returns masked secret when set', async () => {
    resolveS3Config.mockResolvedValue({
      endpoint: 'https://minio:9000',
      bucket: 'parchment',
      accessKeyId: 'AKIA',
      secretAccessKey: 'super-secret',
      region: 'us-east-1',
      prefix: '',
      scheduleHours: 24,
      enabled: true,
    })
    const { GET } = await import('@/app/api/settings/backup/s3/route')
    const res = await GET(makeReq({}) as never)
    const body = await res.json()
    expect(body.endpoint).toBe('https://minio:9000')
    expect(body.bucket).toBe('parchment')
    expect(body.secretAccessKey).toBe(SECRET_MASK)
    // The plaintext secret must NEVER be returned.
    expect(JSON.stringify(body)).not.toContain('super-secret')
  })

  it('returns null secret when unset', async () => {
    resolveS3Config.mockResolvedValue(null)
    const { GET } = await import('@/app/api/settings/backup/s3/route')
    const res = await GET(makeReq({}) as never)
    const body = await res.json()
    expect(body.secretAccessKey).toBeNull()
    expect(body.enabled).toBe(false)
  })
})

describe('PUT /api/settings/backup/s3', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { PUT } = await import('@/app/api/settings/backup/s3/route')
    const res = await PUT(makeReq({ endpoint: 'x', bucket: 'y', enabled: true }) as never)
    expect(res.status).toBe(403)
  })

  it('saves config and calls reconfigureS3Job', async () => {
    const { PUT } = await import('@/app/api/settings/backup/s3/route')
    const res = await PUT(
      makeReq({
        endpoint: 'https://minio:9000',
        bucket: 'parchment',
        accessKeyId: 'AKIA',
        secretAccessKey: 'shh',
        region: 'us-east-1',
        prefix: 'b/',
        scheduleHours: 12,
        enabled: true,
      }) as never,
    )
    expect(res.status).toBe(200)
    expect(saveS3Config).toHaveBeenCalledOnce()
    expect(reconfigureS3Job).toHaveBeenCalledWith(true)
  })

  it('400 when enabled but endpoint+bucket missing', async () => {
    const { PUT } = await import('@/app/api/settings/backup/s3/route')
    const res = await PUT(makeReq({ enabled: true }) as never)
    expect(res.status).toBe(400)
    expect(saveS3Config).not.toHaveBeenCalled()
  })

  it('does NOT forward a masked secret to saveS3Config', async () => {
    const { PUT } = await import('@/app/api/settings/backup/s3/route')
    await PUT(
      makeReq({
        endpoint: 'https://minio:9000',
        bucket: 'parchment',
        accessKeyId: 'AKIA',
        secretAccessKey: SECRET_MASK,
        enabled: true,
      }) as never,
    )
    expect(saveS3Config).toHaveBeenCalledOnce()
    const arg = saveS3Config.mock.calls[0]?.[0] ?? {}
    expect(arg.secretAccessKey).toBeUndefined()
  })

  it('enabled:false disables without requiring secrets', async () => {
    const { PUT } = await import('@/app/api/settings/backup/s3/route')
    const res = await PUT(makeReq({ enabled: false }) as never)
    expect(res.status).toBe(200)
    expect(reconfigureS3Job).toHaveBeenCalledWith(false)
  })
})

describe('POST /api/settings/backup/s3/test', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { POST } = await import('@/app/api/settings/backup/s3/test/route')
    const res = await POST(makeReq({}) as never)
    expect(res.status).toBe(403)
  })

  it('returns { ok: true } on success', async () => {
    testS3Connection.mockResolvedValue({ ok: true })
    resolveS3Config.mockResolvedValue(null)
    const { POST } = await import('@/app/api/settings/backup/s3/test/route')
    const res = await POST(
      makeReq({
        endpoint: 'https://minio:9000',
        bucket: 'parchment',
        accessKeyId: 'AKIA',
        secretAccessKey: 'shh',
        region: 'us-east-1',
      }) as never,
    )
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns { ok: false, error } on failure', async () => {
    testS3Connection.mockResolvedValue({ ok: false, error: 'no such bucket' })
    resolveS3Config.mockResolvedValue(null)
    const { POST } = await import('@/app/api/settings/backup/s3/test/route')
    const res = await POST(
      makeReq({
        endpoint: 'https://minio:9000',
        bucket: 'parchment',
        accessKeyId: 'AKIA',
        secretAccessKey: 'shh',
      }) as never,
    )
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe('no such bucket')
  })
})
