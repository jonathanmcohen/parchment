import { beforeEach, describe, expect, it, vi } from 'vitest'

// E-T7 — git-sync config API: GET/PUT /api/settings/git-sync, POST push-now,
// POST init. Admin-only. The token is NEVER returned (tokenSet boolean only).

const {
  authenticateRequest,
  isAdmin,
  resolveGitSyncConfig,
  saveGitSyncConfig,
  pushToRemote,
  ensureRepo,
  reconfigureGitSyncJob,
  getAppConfig,
  getAppConfigJson,
  logAudit,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn<() => Promise<unknown>>(),
  isAdmin: vi.fn<(u: unknown) => boolean>(),
  resolveGitSyncConfig: vi.fn<() => Promise<unknown>>(),
  saveGitSyncConfig: vi.fn<(c: { token?: string }) => Promise<void>>(),
  pushToRemote: vi.fn<() => Promise<unknown>>(),
  ensureRepo: vi.fn<() => Promise<void>>(),
  reconfigureGitSyncJob: vi.fn<(e: boolean, h?: number) => void>(),
  getAppConfig: vi.fn<(k: string) => Promise<string | null>>(),
  getAppConfigJson: vi.fn<(k: string) => Promise<unknown>>(),
  logAudit: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/lib/auth/guard', () => ({ authenticateRequest, isAdmin }))
vi.mock('@/lib/git/sync-config', () => ({ resolveGitSyncConfig, saveGitSyncConfig }))
vi.mock('@/lib/git/remote', () => ({ pushToRemote }))
vi.mock('@/lib/git/repo', () => ({ ensureRepo }))
vi.mock('@/lib/schedules/scheduler', () => ({ scheduler: { reconfigureGitSyncJob } }))
vi.mock('@/lib/config/repo', () => ({ getAppConfig, getAppConfigJson }))
vi.mock('@/lib/audit', () => ({ logAudit }))

const ADMIN = { id: 'u1', role: 'admin', email: 'a@p.local' }
const CONFIG = {
  remoteUrl: 'https://github.com/u/r.git',
  branch: 'main',
  token: 'secret-token',
  authorName: 'Parchment',
  authorEmail: 'parchment@localhost',
  scheduleHours: 24,
  enabled: true,
}

function makeReq(body: Record<string, unknown> | null = null) {
  return {
    json: async () => {
      if (body === null) throw new Error('no body')
      return body
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  isAdmin.mockReturnValue(true)
  authenticateRequest.mockResolvedValue(ADMIN)
  resolveGitSyncConfig.mockResolvedValue(CONFIG)
  getAppConfig.mockResolvedValue('secret-token')
  getAppConfigJson.mockResolvedValue(null)
  pushToRemote.mockResolvedValue({ ok: true, oid: 'abc' })
})

describe('GET /api/settings/git-sync', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { GET } = await import('@/app/api/settings/git-sync/route')
    expect((await GET(makeReq())).status).toBe(403)
  })

  it('returns config with tokenSet, never the token', async () => {
    getAppConfigJson.mockImplementation(async (k: string) =>
      k === 'git.lastPush' ? { oid: 'abc', at: '2026-01-01' } : null,
    )
    const { GET } = await import('@/app/api/settings/git-sync/route')
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.remoteUrl).toBe('https://github.com/u/r.git')
    expect(body.tokenSet).toBe(true)
    expect(body.token).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('secret-token')
    expect(body.lastPush.oid).toBe('abc')
  })

  it('tokenSet false when no token stored', async () => {
    getAppConfig.mockResolvedValue(null)
    resolveGitSyncConfig.mockResolvedValue(null)
    const { GET } = await import('@/app/api/settings/git-sync/route')
    const body = await (await GET(makeReq())).json()
    expect(body.tokenSet).toBe(false)
  })
})

describe('PUT /api/settings/git-sync', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { PUT } = await import('@/app/api/settings/git-sync/route')
    expect((await PUT(makeReq({ enabled: false }))).status).toBe(403)
  })

  it('saves config and calls reconfigureGitSyncJob', async () => {
    const { PUT } = await import('@/app/api/settings/git-sync/route')
    const res = await PUT(
      makeReq({
        remoteUrl: 'https://github.com/u/r.git',
        token: 'new-token',
        scheduleHours: 6,
        enabled: true,
      }),
    )
    expect(res.status).toBe(200)
    expect(saveGitSyncConfig).toHaveBeenCalledOnce()
    expect(reconfigureGitSyncJob).toHaveBeenCalledWith(true, 6)
  })

  it('forwards an empty token to revoke', async () => {
    const { PUT } = await import('@/app/api/settings/git-sync/route')
    await PUT(makeReq({ token: '', enabled: false }))
    const arg = saveGitSyncConfig.mock.calls[0]?.[0]
    expect(arg?.token).toBe('')
  })
})

describe('POST /api/settings/git-sync/push-now', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { POST } = await import('@/app/api/settings/git-sync/push-now/route')
    expect((await POST(makeReq())).status).toBe(403)
  })

  it('calls pushToRemote and returns the PushResult', async () => {
    const { POST } = await import('@/app/api/settings/git-sync/push-now/route')
    const res = await POST(makeReq())
    expect(pushToRemote).toHaveBeenCalled()
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.oid).toBe('abc')
  })

  it('400 when git sync is not configured', async () => {
    resolveGitSyncConfig.mockResolvedValue(null)
    const { POST } = await import('@/app/api/settings/git-sync/push-now/route')
    const res = await POST(makeReq())
    expect(res.status).toBe(400)
    expect(pushToRemote).not.toHaveBeenCalled()
  })
})

describe('POST /api/settings/git-sync/init', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { POST } = await import('@/app/api/settings/git-sync/init/route')
    expect((await POST(makeReq())).status).toBe(403)
  })

  it('calls ensureRepo then pushToRemote and returns oid', async () => {
    const { POST } = await import('@/app/api/settings/git-sync/init/route')
    const res = await POST(makeReq())
    expect(ensureRepo).toHaveBeenCalled()
    expect(pushToRemote).toHaveBeenCalled()
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.oid).toBe('abc')
  })
})
