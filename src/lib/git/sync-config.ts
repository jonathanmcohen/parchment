// E — git-sync configuration. HTTPS-only (SSH is v0.2.1). The token is plaintext
// at runtime but stored encrypted in app_config (git.token); the rest is JSON in
// app_config (git.config). parseGitSyncConfig validates + fills defaults.

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
