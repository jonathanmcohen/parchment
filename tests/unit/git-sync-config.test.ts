import { describe, expect, it } from 'vitest'
import { parseGitSyncConfig } from '@/lib/git/sync-config'

// E-T1 — parseGitSyncConfig: HTTPS-only, branch sanitize, schedule clamp, defaults.

describe('parseGitSyncConfig', () => {
  it('returns a valid config with defaults filled', () => {
    const cfg = parseGitSyncConfig({
      remoteUrl: 'https://github.com/user/repo.git',
      branch: 'main',
      token: 'x',
      enabled: true,
    })
    expect(cfg).not.toBeNull()
    expect(cfg?.remoteUrl).toBe('https://github.com/user/repo.git')
    expect(cfg?.branch).toBe('main')
    expect(cfg?.token).toBe('x')
    expect(cfg?.authorName).toBe('Parchment')
    expect(cfg?.authorEmail).toBe('parchment@localhost')
    expect(cfg?.scheduleHours).toBe(24)
    expect(cfg?.enabled).toBe(true)
  })

  it('rejects SSH remotes (HTTPS only)', () => {
    expect(
      parseGitSyncConfig({ remoteUrl: 'ssh://git@github.com/user/repo.git', token: 'x' }),
    ).toBeNull()
    expect(parseGitSyncConfig({ remoteUrl: 'git@github.com:user/repo.git', token: 'x' })).toBeNull()
  })

  it('rejects a non-https remoteUrl', () => {
    expect(parseGitSyncConfig({ remoteUrl: 'http://github.com/u/r.git', token: 'x' })).toBeNull()
  })

  it('returns null when remoteUrl is missing', () => {
    expect(parseGitSyncConfig({ token: 'x', branch: 'main' })).toBeNull()
    expect(parseGitSyncConfig({})).toBeNull()
    expect(parseGitSyncConfig(null)).toBeNull()
  })

  it('clamps scheduleHours to [0, 168]', () => {
    expect(
      parseGitSyncConfig({ remoteUrl: 'https://x/r.git', token: 't', scheduleHours: -5 })
        ?.scheduleHours,
    ).toBe(0)
    expect(
      parseGitSyncConfig({ remoteUrl: 'https://x/r.git', token: 't', scheduleHours: 999 })
        ?.scheduleHours,
    ).toBe(168)
    expect(
      parseGitSyncConfig({ remoteUrl: 'https://x/r.git', token: 't', scheduleHours: 6 })
        ?.scheduleHours,
    ).toBe(6)
  })

  it('defaults branch to main and sanitizes it', () => {
    expect(parseGitSyncConfig({ remoteUrl: 'https://x/r.git', token: 't' })?.branch).toBe('main')
    // ".." and spaces are rejected → falls back to main.
    expect(
      parseGitSyncConfig({ remoteUrl: 'https://x/r.git', token: 't', branch: '../evil' })?.branch,
    ).toBe('main')
    expect(
      parseGitSyncConfig({ remoteUrl: 'https://x/r.git', token: 't', branch: 'has space' })?.branch,
    ).toBe('main')
    // A long branch name (>100 chars) is rejected → main.
    expect(
      parseGitSyncConfig({ remoteUrl: 'https://x/r.git', token: 't', branch: 'b'.repeat(101) })
        ?.branch,
    ).toBe('main')
    // A valid feature branch is kept.
    expect(
      parseGitSyncConfig({ remoteUrl: 'https://x/r.git', token: 't', branch: 'feature/x' })?.branch,
    ).toBe('feature/x')
  })
})
