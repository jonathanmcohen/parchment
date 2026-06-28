import { beforeEach, describe, expect, it, vi } from 'vitest'

// D2-T6 dep — POST /api/settings/backup/restore (uploaded zip, optional filter).
// Admin-only. With a filter → restoreWorkspaceBackupSelective; without → full
// restoreWorkspaceBackup.

const { authenticateRequest, isAdmin, restoreWorkspaceBackup, restoreWorkspaceBackupSelective } =
  vi.hoisted(() => ({
    authenticateRequest: vi.fn<() => Promise<unknown>>(),
    isAdmin: vi.fn<(u: unknown) => boolean>(),
    restoreWorkspaceBackup: vi.fn<() => Promise<unknown>>(),
    restoreWorkspaceBackupSelective: vi.fn<() => Promise<unknown>>(),
  }))

vi.mock('@/lib/auth/guard', () => ({ authenticateRequest, isAdmin }))
vi.mock('@/lib/backup/service', () => ({
  restoreWorkspaceBackup,
  restoreWorkspaceBackupSelective,
}))

const ADMIN = { id: 'u1', role: 'admin', email: 'a@p.local' }
const PK = new Uint8Array([0x50, 0x4b, 0x03, 0x04])

function makeReq(opts: { filter?: Record<string, unknown>; noFile?: boolean }) {
  const fd = new FormData()
  if (!opts.noFile) fd.set('zip', new File([PK as BlobPart], 'b.zip', { type: 'application/zip' }))
  if (opts.filter) fd.set('filter', JSON.stringify(opts.filter))
  return {
    headers: { get: () => null },
    formData: async () => fd,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  isAdmin.mockReturnValue(true)
  authenticateRequest.mockResolvedValue(ADMIN)
  restoreWorkspaceBackup.mockResolvedValue({ created: 3, skipped: 0, warnings: [] })
  restoreWorkspaceBackupSelective.mockResolvedValue({
    created: 1,
    skipped: 0,
    warnings: [],
    filtered: 2,
  })
})

describe('POST /api/settings/backup/restore', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockReturnValue(false)
    const { POST } = await import('@/app/api/settings/backup/restore/route')
    expect((await POST(makeReq({}))).status).toBe(403)
  })

  it('full restore when no filter', async () => {
    const { POST } = await import('@/app/api/settings/backup/restore/route')
    const res = await POST(makeReq({}))
    expect(res.status).toBe(200)
    expect(restoreWorkspaceBackup).toHaveBeenCalled()
    expect(restoreWorkspaceBackupSelective).not.toHaveBeenCalled()
  })

  it('selective restore when a filter is present', async () => {
    const { POST } = await import('@/app/api/settings/backup/restore/route')
    const res = await POST(makeReq({ filter: { docTitles: ['A'] } }))
    const body = await res.json()
    expect(restoreWorkspaceBackupSelective).toHaveBeenCalled()
    expect(body.filtered).toBe(2)
  })

  it('400 when no file', async () => {
    const { POST } = await import('@/app/api/settings/backup/restore/route')
    expect((await POST(makeReq({ noFile: true }))).status).toBe(400)
  })
})
