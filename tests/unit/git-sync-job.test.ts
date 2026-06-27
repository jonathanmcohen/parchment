import { beforeEach, describe, expect, it, vi } from 'vitest'

// E-T5 — gitSyncJob: reads config, pushes, records lastPush/lastError. A
// non-fast-forward (or any error) records git.lastError AND throws so the
// scheduler marks lastStatus:'error'. Unconfigured = silent no-op (no throw).

const { resolveGitSyncConfig, pushToRemote, setAppConfigJson } = vi.hoisted(() => ({
  resolveGitSyncConfig: vi.fn<() => Promise<unknown>>(),
  pushToRemote: vi.fn<() => Promise<unknown>>(),
  setAppConfigJson: vi.fn<(k: string, v: unknown) => Promise<void>>(),
}))

vi.mock('@/lib/git/sync-config', () => ({ resolveGitSyncConfig }))
vi.mock('@/lib/git/remote', () => ({ pushToRemote }))
vi.mock('@/lib/config/repo', () => ({ setAppConfigJson }))

const CONFIG = {
  remoteUrl: 'https://x/r.git',
  branch: 'main',
  token: 't',
  authorName: 'Parchment',
  authorEmail: 'parchment@localhost',
  scheduleHours: 24,
  enabled: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveGitSyncConfig.mockResolvedValue(CONFIG)
})

describe('gitSyncJob', () => {
  it('is a no-op (no throw) when unconfigured', async () => {
    resolveGitSyncConfig.mockResolvedValue(null)
    const { gitSyncJob } = await import('@/lib/git/sync-job')
    await expect(gitSyncJob()).resolves.toBeUndefined()
    expect(pushToRemote).not.toHaveBeenCalled()
  })

  it('records git.lastPush on success (no throw)', async () => {
    pushToRemote.mockResolvedValue({ ok: true, oid: 'abc' })
    const { gitSyncJob } = await import('@/lib/git/sync-job')
    await expect(gitSyncJob()).resolves.toBeUndefined()
    const call = setAppConfigJson.mock.calls.find((c) => c[0] === 'git.lastPush')
    expect(call).toBeDefined()
    expect((call?.[1] as { oid: string }).oid).toBe('abc')
  })

  it('records git.lastError AND throws on non_fast_forward', async () => {
    pushToRemote.mockResolvedValue({
      ok: false,
      error: 'non_fast_forward',
      message: 'rejected',
    })
    const { gitSyncJob } = await import('@/lib/git/sync-job')
    await expect(gitSyncJob()).rejects.toThrow()
    const call = setAppConfigJson.mock.calls.find((c) => c[0] === 'git.lastError')
    expect(call).toBeDefined()
    expect((call?.[1] as { kind: string }).kind).toBe('non_fast_forward')
  })

  it('records git.lastError AND throws on any other push error', async () => {
    pushToRemote.mockResolvedValue({ ok: false, error: 'auth_failed', message: 'auth failed' })
    const { gitSyncJob } = await import('@/lib/git/sync-job')
    await expect(gitSyncJob()).rejects.toThrow()
    const call = setAppConfigJson.mock.calls.find((c) => c[0] === 'git.lastError')
    expect(call).toBeDefined()
    expect((call?.[1] as { kind: string }).kind).toBe('auth_failed')
  })
})
