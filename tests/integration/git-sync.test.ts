import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// INT-T3 — git sync against real Postgres + a real temp files-root. isomorphic-git
// `push` (and the remote-management calls) are mocked; init/add/commit/resolveRef
// run for real so ensureRepo + commits produce a genuine repo.

const { pushMock, listRemotesMock, addRemoteMock } = vi.hoisted(() => ({
  pushMock: vi.fn<() => Promise<unknown>>(),
  listRemotesMock: vi.fn<() => Promise<{ remote: string; url: string }[]>>(),
  addRemoteMock: vi.fn<() => Promise<void>>(),
}))

vi.mock('isomorphic-git', async (orig) => {
  const actual = (await orig()) as { default: Record<string, unknown> }
  return {
    default: {
      ...actual.default,
      push: pushMock,
      listRemotes: listRemotesMock,
      addRemote: addRemoteMock,
    },
  }
})

let container: StartedPostgreSqlContainer
let filesRoot: string
const migrationsDir = path.resolve('src/db/migrations')

const CONFIG = {
  remoteUrl: 'https://github.com/u/r.git',
  branch: 'main',
  token: 'integration-token',
  authorName: 'Parchment',
  authorEmail: 'parchment@localhost',
  scheduleHours: 24,
  enabled: true,
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()

  const url = container.getConnectionUri()
  const c = new Client({ connectionString: url })
  await c.connect()
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  await c.end()
  process.env.DATABASE_URL = url

  filesRoot = mkdtempSync(path.join(tmpdir(), 'parchment-git-'))
  process.env.PARCHMENT_FILES_ROOT = filesRoot
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

beforeEach(() => {
  vi.clearAllMocks()
  listRemotesMock.mockResolvedValue([{ remote: 'origin', url: CONFIG.remoteUrl }])
})

describe('INT-T3 — git sync', () => {
  it('ensureRepo + commit + pushToRemote(success) → { ok: true }', async () => {
    const { ensureRepo, commitPath } = await import('@/lib/git/repo')
    await ensureRepo()
    // Write a file into the repo and commit it (real isomorphic-git add/commit).
    const fs = await import('node:fs/promises')
    await fs.writeFile(path.join(filesRoot, 'note.md'), '# hello\n')
    await commitPath('note.md', 'add note')

    pushMock.mockResolvedValue({ ok: true })
    const { pushToRemote } = await import('@/lib/git/remote')
    const res = await pushToRemote(CONFIG)
    expect(res.ok).toBe(true)
    if (res.ok) expect(typeof res.oid).toBe('string')
  })

  it('non-fast-forward push → error result + git.lastError written', async () => {
    pushMock.mockRejectedValue(Object.assign(new Error('rejected'), { code: 'PushRejectedError' }))
    const { gitSyncJob } = await import('@/lib/git/sync-job')
    const { saveGitSyncConfig } = await import('@/lib/git/sync-config')
    await saveGitSyncConfig({ ...CONFIG })

    await expect(gitSyncJob()).rejects.toThrow()

    const { getAppConfigJson } = await import('@/lib/config/repo')
    const lastError = await getAppConfigJson<{ kind: string }>('git.lastError')
    expect(lastError?.kind).toBe('non_fast_forward')
  })

  it('gitSyncJob is a no-op (no throw) when unconfigured', async () => {
    const { saveGitSyncConfig } = await import('@/lib/git/sync-config')
    await saveGitSyncConfig({ enabled: false })
    const { gitSyncJob } = await import('@/lib/git/sync-job')
    await expect(gitSyncJob()).resolves.toBeUndefined()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('maybePushOnChange pushes when scheduleHours === 0', async () => {
    pushMock.mockResolvedValue({ ok: true })
    const { saveGitSyncConfig } = await import('@/lib/git/sync-config')
    await saveGitSyncConfig({ ...CONFIG, scheduleHours: 0 })
    const { maybePushOnChange } = await import('@/lib/git/remote')
    await maybePushOnChange()
    expect(pushMock).toHaveBeenCalled()
  })
})
