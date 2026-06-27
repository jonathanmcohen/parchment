import { beforeEach, describe, expect, it, vi } from 'vitest'

// I3-T5 — GET /api/settings/backup/verify-status returns the scheduler job state
// + the last verify result. Admin-only.

const { authenticateRequest, isAdmin, getAppConfigJson, getState } = vi.hoisted(() => ({
  authenticateRequest: vi.fn<() => Promise<unknown>>(),
  isAdmin: vi.fn<(u: unknown) => boolean>(),
  getAppConfigJson: vi.fn<(k: string) => Promise<unknown>>(),
  getState: vi.fn<() => { name: string }[]>(),
}))

vi.mock('@/lib/auth/guard', () => ({ authenticateRequest, isAdmin }))
vi.mock('@/lib/config/repo', () => ({ getAppConfigJson }))
vi.mock('@/lib/schedules/scheduler', () => ({ scheduler: { getState } }))

const ADMIN = { id: 'u1', role: 'admin', email: 'a@p.local' }
const makeReq = () => ({}) as never

beforeEach(() => {
  vi.clearAllMocks()
  isAdmin.mockReturnValue(true)
  authenticateRequest.mockResolvedValue(ADMIN)
  getState.mockReturnValue([{ name: 'backup-verify' }, { name: 'trash-purge' }])
  getAppConfigJson.mockResolvedValue({ ok: true, docCount: 4, at: '2026-01-01' })
})

describe('GET /api/settings/backup/verify-status', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { GET } = await import('@/app/api/settings/backup/verify-status/route')
    expect((await GET(makeReq())).status).toBe(403)
  })

  it('returns the backup-verify job state + lastResult', async () => {
    const { GET } = await import('@/app/api/settings/backup/verify-status/route')
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.schedulerState?.name).toBe('backup-verify')
    expect(body.lastResult?.ok).toBe(true)
    expect(body.lastResult?.docCount).toBe(4)
  })

  it('null lastResult when none stored', async () => {
    getAppConfigJson.mockResolvedValue(null)
    const { GET } = await import('@/app/api/settings/backup/verify-status/route')
    const body = await (await GET(makeReq())).json()
    expect(body.lastResult).toBeNull()
  })
})
