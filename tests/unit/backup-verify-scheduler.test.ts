import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// I3-T3 — the scheduler registers a 'backup-verify' job ON BY DEFAULT (zero
// config, no env gate) with a 7-day interval. backupVerifyJob is mocked to a
// no-op so no DB/backup work runs.

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({
  db: { select: () => ({ from: () => ({ limit: async () => [] }) }) },
  schema: { users: { id: 'id' } },
}))
vi.mock('@/lib/docs/repo', () => ({ purgeExpiredTrash: vi.fn() }))
vi.mock('@/lib/docs/settings-repo', () => ({
  getTrashRetentionDays: vi.fn().mockResolvedValue(30),
}))
vi.mock('@/lib/backup/service', () => ({
  createWorkspaceBackup: vi.fn().mockResolvedValue(new Uint8Array()),
}))
vi.mock('@/lib/backup/verify-job', () => ({
  backupVerifyJob: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/backup/s3-config', () => ({ isS3Active: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/git/sync-config', () => ({ resolveGitSyncConfig: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/git/sync-job', () => ({ gitSyncJob: vi.fn() }))

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

describe('scheduler — backup-verify registration', () => {
  const savedGlobal = (globalThis as Record<string, unknown>).__scheduler
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__scheduler
    vi.resetModules()
  })
  afterEach(() => {
    ;(globalThis as Record<string, unknown>).__scheduler = savedGlobal
  })

  it('registers backup-verify (7 days) by default', async () => {
    const { scheduler } = await import('@/lib/schedules/scheduler')
    const state = scheduler.getState()
    const verify = state.find((j) => j.name === 'backup-verify')
    expect(verify).toBeDefined()
    expect(verify?.intervalMs).toBe(SEVEN_DAYS_MS)
  })
})
