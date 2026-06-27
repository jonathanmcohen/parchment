import { beforeEach, describe, expect, it, vi } from 'vitest'

// E-T3 — pushToRemote: the isomorphic-git push wrapper. Classifies push outcomes
// (success / non_fast_forward / auth_failed / network / unknown) and NEVER echoes
// the token.

const { listRemotes, addRemote, push, resolveRef } = vi.hoisted(() => ({
  listRemotes: vi.fn<() => Promise<{ remote: string; url: string }[]>>(),
  addRemote: vi.fn<() => Promise<void>>(),
  push: vi.fn<() => Promise<unknown>>(),
  resolveRef: vi.fn<() => Promise<string>>(),
}))

vi.mock('isomorphic-git', () => ({
  default: { listRemotes, addRemote, push, resolveRef },
}))
vi.mock('isomorphic-git/http/node', () => ({ default: {} }))
vi.mock('@/lib/git/repo', () => ({ gitDir: () => '/tmp/test-files' }))

const CONFIG = {
  remoteUrl: 'https://github.com/u/r.git',
  branch: 'main',
  token: 'super-secret-token',
  authorName: 'Parchment',
  authorEmail: 'parchment@localhost',
  scheduleHours: 24,
  enabled: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  listRemotes.mockResolvedValue([{ remote: 'origin', url: CONFIG.remoteUrl }])
  resolveRef.mockResolvedValue('abc123')
  push.mockResolvedValue({ ok: true })
})

describe('pushToRemote', () => {
  it('returns not_configured (without calling push) when disabled', async () => {
    const { pushToRemote } = await import('@/lib/git/remote')
    const res = await pushToRemote({ ...CONFIG, enabled: false })
    expect(res).toEqual({ ok: false, error: 'not_configured', message: expect.any(String) })
    expect(push).not.toHaveBeenCalled()
  })

  it('returns { ok: true, oid } on a successful push', async () => {
    const { pushToRemote } = await import('@/lib/git/remote')
    const res = await pushToRemote(CONFIG)
    expect(res).toEqual({ ok: true, oid: 'abc123' })
    expect(push).toHaveBeenCalledOnce()
  })

  it('adds the remote when origin url differs', async () => {
    listRemotes.mockResolvedValue([{ remote: 'origin', url: 'https://old/r.git' }])
    const { pushToRemote } = await import('@/lib/git/remote')
    await pushToRemote(CONFIG)
    expect(addRemote).toHaveBeenCalled()
  })

  it('classifies a PushRejectedError as non_fast_forward', async () => {
    const err = Object.assign(new Error('push rejected'), { code: 'PushRejectedError' })
    push.mockRejectedValue(err)
    const { pushToRemote } = await import('@/lib/git/remote')
    const res = await pushToRemote(CONFIG)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('non_fast_forward')
  })

  it('classifies a "rejected" message as non_fast_forward', async () => {
    push.mockRejectedValue(new Error('Updates were rejected because the remote contains work'))
    const { pushToRemote } = await import('@/lib/git/remote')
    const res = await pushToRemote(CONFIG)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('non_fast_forward')
  })

  it('classifies a 401/403 as auth_failed and never echoes the token', async () => {
    push.mockRejectedValue(new Error('HTTP Error: 401 Unauthorized for super-secret-token'))
    const { pushToRemote } = await import('@/lib/git/remote')
    const res = await pushToRemote(CONFIG)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('auth_failed')
      expect(res.message).not.toContain('super-secret-token')
    }
  })

  it('classifies a fetch/network failure as network', async () => {
    push.mockRejectedValue(new Error('request to https://github.com failed, reason: ECONNREFUSED'))
    const { pushToRemote } = await import('@/lib/git/remote')
    const res = await pushToRemote(CONFIG)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('network')
  })

  it('never includes the token in any result message', async () => {
    push.mockRejectedValue(new Error(`boom token=${CONFIG.token}`))
    const { pushToRemote } = await import('@/lib/git/remote')
    const res = await pushToRemote(CONFIG)
    if (!res.ok) expect(res.message).not.toContain(CONFIG.token)
  })
})
