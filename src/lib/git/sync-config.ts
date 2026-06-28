// E — git-sync configuration. HTTPS-only (SSH is v0.2.1). The token is plaintext
// at runtime but stored encrypted in app_config (git.token); the rest is JSON in
// app_config (git.config). parseGitSyncConfig validates + fills defaults.

import {
  deleteAppConfig,
  getAppConfig,
  getAppConfigJson,
  setAppConfig,
  setAppConfigJson,
} from '@/lib/config/repo'

export interface GitSyncConfig {
  remoteUrl: string // HTTPS URL
  branch: string // default 'main'
  token: string // plaintext at runtime (stored encrypted)
  authorName: string // default 'Parchment'
  authorEmail: string // default 'parchment@localhost'
  scheduleHours: number // default 24; 0 = push-on-change only
  enabled: boolean
}

export const GIT_SYNC_DEFAULTS = {
  branch: 'main',
  authorName: 'Parchment',
  authorEmail: 'parchment@localhost',
  scheduleHours: 24,
} as const

const MAX_SCHEDULE_HOURS = 168 // one week

/** A safe branch name: no traversal, no whitespace, ≤ 100 chars, non-empty. */
function sanitizeBranch(raw: unknown): string {
  if (typeof raw !== 'string') return GIT_SYNC_DEFAULTS.branch
  const b = raw.trim()
  if (b === '' || b.length > 100) return GIT_SYNC_DEFAULTS.branch
  if (b.includes('..') || /\s/.test(b)) return GIT_SYNC_DEFAULTS.branch
  return b
}

function clampSchedule(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return GIT_SYNC_DEFAULTS.scheduleHours
  return Math.min(MAX_SCHEDULE_HOURS, Math.max(0, Math.floor(n)))
}

/**
 * Parse + validate a raw git-sync config. Returns null when invalid:
 * - `remoteUrl` absent or not an https:// URL (token auth over clear-text is a
 *   vulnerability — same rule as migrate push).
 * Defaults fill branch/author/schedule. `scheduleHours` is clamped to [0, 168].
 */
export function parseGitSyncConfig(raw: unknown): GitSyncConfig | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>

  const remoteUrl = typeof o.remoteUrl === 'string' ? o.remoteUrl.trim() : ''
  if (!remoteUrl) return null
  // https-only.
  let parsed: URL
  try {
    parsed = new URL(remoteUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null

  return {
    remoteUrl,
    branch: sanitizeBranch(o.branch),
    token: typeof o.token === 'string' ? o.token : '',
    authorName:
      typeof o.authorName === 'string' && o.authorName.trim() !== ''
        ? o.authorName.trim()
        : GIT_SYNC_DEFAULTS.authorName,
    authorEmail:
      typeof o.authorEmail === 'string' && o.authorEmail.trim() !== ''
        ? o.authorEmail.trim()
        : GIT_SYNC_DEFAULTS.authorEmail,
    scheduleHours: clampSchedule(o.scheduleHours),
    enabled: Boolean(o.enabled),
  }
}

/** Shape of the non-secret git config persisted as JSON under `git.config`. */
interface StoredGitConfig {
  remoteUrl?: string
  branch?: string
  authorName?: string
  authorEmail?: string
  scheduleHours?: number
  enabled?: boolean
}

/**
 * Resolve the active git-sync config from app_config: `git.config` (JSON, non-
 * secret) merged with `git.token` (encrypted). Returns null when remoteUrl is
 * absent OR enabled is false OR the merged config fails validation.
 */
export async function resolveGitSyncConfig(): Promise<GitSyncConfig | null> {
  const stored = (await getAppConfigJson<StoredGitConfig>('git.config')) ?? {}
  if (!stored.enabled) return null
  const token = (await getAppConfig('git.token')) ?? ''
  return parseGitSyncConfig({ ...stored, token })
}

/**
 * Persist git-sync config. The token is stored encrypted under `git.token`
 * (an empty-string token DELETES it — a revoke); the rest is stored as JSON
 * under `git.config`. Only the provided non-secret fields are merged.
 */
export async function saveGitSyncConfig(
  cfg: Partial<GitSyncConfig> & { token?: string },
): Promise<void> {
  const existing = (await getAppConfigJson<StoredGitConfig>('git.config')) ?? {}
  const merged: StoredGitConfig = {
    ...existing,
    ...(cfg.remoteUrl !== undefined ? { remoteUrl: cfg.remoteUrl } : {}),
    ...(cfg.branch !== undefined ? { branch: cfg.branch } : {}),
    ...(cfg.authorName !== undefined ? { authorName: cfg.authorName } : {}),
    ...(cfg.authorEmail !== undefined ? { authorEmail: cfg.authorEmail } : {}),
    ...(cfg.scheduleHours !== undefined ? { scheduleHours: cfg.scheduleHours } : {}),
    ...(cfg.enabled !== undefined ? { enabled: cfg.enabled } : {}),
  }
  await setAppConfigJson('git.config', merged)

  if (cfg.token !== undefined) {
    if (cfg.token === '') {
      await deleteAppConfig('git.token') // revoke
    } else {
      await setAppConfig('git.token', cfg.token)
    }
  }
}
