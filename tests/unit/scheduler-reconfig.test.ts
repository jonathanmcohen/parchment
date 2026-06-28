import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// F1-T3 — live re-register of the s3-backup job without a restart.
//
// Two layers:
//  1. The pure Scheduler core's unregister(): add/remove a job, idempotency.
//  2. The SchedulerSingleton.reconfigureS3Job(enabled): registers/removes the
//     real 's3-backup' job. We mock the singleton's heavy deps and reset the
//     cached global between tests so no global state leaks.

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
// Force isS3Active=false at registerDefaults time so the baseline has no
// s3-backup job; reconfigureS3Job is what adds it in these tests.
vi.mock('@/lib/backup/s3-config', () => ({
  isS3Active: vi.fn().mockResolvedValue(false),
}))

describe('Scheduler core — unregister()', () => {
  it('adds then removes a job; idempotent; unknown name is a no-op', async () => {
    const { Scheduler } = await import('@/lib/schedules/jobs')
    const s = new Scheduler()
    expect(s.has('x')).toBe(false)

    s.register({ name: 'x', intervalMs: 1000, run: async () => {} })
    expect(s.has('x')).toBe(true)
    expect(s.getState().map((j) => j.name)).toContain('x')

    // Registering the same name twice does not duplicate it.
    s.register({ name: 'x', intervalMs: 1000, run: async () => {} })
    expect(s.getState().filter((j) => j.name === 'x')).toHaveLength(1)

    s.unregister('x')
    expect(s.has('x')).toBe(false)
    expect(s.getState().map((j) => j.name)).not.toContain('x')

    // No-op for an unknown name.
    expect(() => s.unregister('does-not-exist')).not.toThrow()
  })
})

describe('SchedulerSingleton.reconfigureS3Job', () => {
  const savedGlobal = (globalThis as Record<string, unknown>).__scheduler

  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__scheduler
    vi.resetModules()
  })
  afterEach(() => {
    ;(globalThis as Record<string, unknown>).__scheduler = savedGlobal
  })

  it('starts with no s3-backup job', async () => {
    const { scheduler } = await import('@/lib/schedules/scheduler')
    expect(scheduler.getState().map((j) => j.name)).not.toContain('s3-backup')
  })

  it('reconfigureS3Job(true) registers s3-backup', async () => {
    const { scheduler } = await import('@/lib/schedules/scheduler')
    scheduler.reconfigureS3Job(true)
    expect(scheduler.getState().map((j) => j.name)).toContain('s3-backup')
  })

  it('reconfigureS3Job(false) removes s3-backup', async () => {
    const { scheduler } = await import('@/lib/schedules/scheduler')
    scheduler.reconfigureS3Job(true)
    expect(scheduler.getState().map((j) => j.name)).toContain('s3-backup')
    scheduler.reconfigureS3Job(false)
    expect(scheduler.getState().map((j) => j.name)).not.toContain('s3-backup')
  })

  it('reconfigureS3Job(true) twice does not register two jobs', async () => {
    const { scheduler } = await import('@/lib/schedules/scheduler')
    scheduler.reconfigureS3Job(true)
    scheduler.reconfigureS3Job(true)
    expect(scheduler.getState().filter((j) => j.name === 's3-backup')).toHaveLength(1)
  })
})
