import { beforeEach, describe, expect, it, vi } from 'vitest'

// I3-T1 — backupVerifyJob: build a backup for the first user, parse it, and
// record verify.lastResult. Corrupt/warn → record + throw (scheduler error);
// no users → record 'skipped', no throw.

const { createWorkspaceBackup, parseWorkspaceBackup, setAppConfigJson, dbLimit } = vi.hoisted(
  () => ({
    createWorkspaceBackup: vi.fn<() => Promise<Uint8Array>>(),
    parseWorkspaceBackup: vi.fn<() => Promise<unknown>>(),
    setAppConfigJson: vi.fn<(k: string, v: unknown) => Promise<void>>(),
    dbLimit: vi.fn<() => Promise<{ id: string }[]>>(),
  }),
)

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({
  db: { select: () => ({ from: () => ({ limit: dbLimit }) }) },
  schema: { users: { id: 'id' } },
}))
vi.mock('@/lib/backup/service', () => ({ createWorkspaceBackup }))
vi.mock('@/lib/backup/archive', () => ({ parseWorkspaceBackup }))
vi.mock('@/lib/config/repo', () => ({ setAppConfigJson }))

const lastResultArg = () =>
  setAppConfigJson.mock.calls.find((c) => c[0] === 'verify.lastResult')?.[1] as
    | Record<string, unknown>
    | undefined

beforeEach(() => {
  vi.clearAllMocks()
  dbLimit.mockResolvedValue([{ id: 'user-1' }])
  createWorkspaceBackup.mockResolvedValue(new Uint8Array([1, 2, 3]))
  parseWorkspaceBackup.mockResolvedValue({ entries: [{}, {}, {}], warnings: [] })
})

describe('backupVerifyJob', () => {
  it('records ok:true with docCount when the backup parses cleanly (no throw)', async () => {
    const { backupVerifyJob } = await import('@/lib/backup/verify-job')
    await expect(backupVerifyJob()).resolves.toBeUndefined()
    const r = lastResultArg()
    expect(r?.ok).toBe(true)
    expect(r?.docCount).toBe(3)
  })

  it('records ok:false AND throws when parseWorkspaceBackup throws (corrupt)', async () => {
    parseWorkspaceBackup.mockRejectedValue(new Error('Not a backup'))
    const { backupVerifyJob } = await import('@/lib/backup/verify-job')
    await expect(backupVerifyJob()).rejects.toThrow()
    const r = lastResultArg()
    expect(r?.ok).toBe(false)
    expect(typeof r?.error).toBe('string')
  })

  it('records ok:"warn" AND throws when there are warnings', async () => {
    parseWorkspaceBackup.mockResolvedValue({
      entries: [{}],
      warnings: ['Missing backup entry for doc x'],
    })
    const { backupVerifyJob } = await import('@/lib/backup/verify-job')
    await expect(backupVerifyJob()).rejects.toThrow()
    const r = lastResultArg()
    expect(r?.ok).toBe('warn')
    expect(Array.isArray(r?.warnings)).toBe(true)
  })

  it('records ok:"skipped" (no throw) when there are no users', async () => {
    dbLimit.mockResolvedValue([])
    const { backupVerifyJob } = await import('@/lib/backup/verify-job')
    await expect(backupVerifyJob()).resolves.toBeUndefined()
    const r = lastResultArg()
    expect(r?.ok).toBe('skipped')
    expect(createWorkspaceBackup).not.toHaveBeenCalled()
  })
})
