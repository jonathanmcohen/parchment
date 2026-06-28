import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// I4 — the s3-backup job is registered on the singleton ONLY when S3 is
// configured (off-unless-configured / CFG-2). We mock the singleton's heavy
// deps (@/db + the backup service + the real S3 SDK path) and flip the env to
// assert the job appears / disappears in getState().

// scheduler.ts transitively imports the s3 + service modules, which use
// 'server-only' — mock it so the import succeeds in the test runner.
vi.mock('server-only', () => ({}))

vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ limit: async () => [] }) }),
  },
  schema: { users: { id: 'id' } },
}))
vi.mock('@/lib/docs/repo', () => ({
  purgeExpiredTrash: vi.fn(),
}))
vi.mock('@/lib/docs/settings-repo', () => ({
  getTrashRetentionDays: vi.fn().mockResolvedValue(30),
}))
vi.mock('@/lib/backup/service', () => ({
  createWorkspaceBackup: vi.fn().mockResolvedValue(new Uint8Array()),
}))

const S3_VARS = [
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
] as const

describe('I4 — scheduler s3-backup registration (off-unless-configured)', () => {
  const saved: Record<string, string | undefined> = {}
  const savedGlobal = (globalThis as Record<string, unknown>).__scheduler

  beforeEach(() => {
    for (const k of S3_VARS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
    // Drop any cached singleton so registerDefaults re-runs against fresh env.
    delete (globalThis as Record<string, unknown>).__scheduler
    vi.resetModules()
  })

  afterEach(() => {
    for (const k of S3_VARS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    ;(globalThis as Record<string, unknown>).__scheduler = savedGlobal
  })

  it('does NOT register s3-backup when S3 is unconfigured — trash-purge + db-heartbeat + backup-verify only', async () => {
    const { scheduler } = await import('@/lib/schedules/scheduler')
    const names = scheduler.getState().map((j) => j.name)
    expect(names).toContain('trash-purge')
    expect(names).toContain('db-heartbeat')
    // backup-sync registers backup-verify ON BY DEFAULT (§1g/§7l).
    expect(names).toContain('backup-verify')
    expect(names).not.toContain('s3-backup')
    expect(names).toHaveLength(3)
  })

  it('registers s3-backup (24h) when all four BACKUP_S3_* vars are set', async () => {
    process.env.BACKUP_S3_ENDPOINT = 'https://minio.local'
    process.env.BACKUP_S3_BUCKET = 'parchment'
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'key'
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secret'

    const { scheduler } = await import('@/lib/schedules/scheduler')
    const state = scheduler.getState()
    const names = state.map((j) => j.name)
    expect(names).toContain('s3-backup')
    const s3 = state.find((j) => j.name === 's3-backup')
    expect(s3?.intervalMs).toBe(24 * 60 * 60 * 1000)
  })
})
