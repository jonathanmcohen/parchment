// J11-3: pure trash-purge countdown helpers for the trash list. NO db, NO React.
// Mirrors the server purge rule (purgeExpiredTrash): a doc is purged once
// now >= trashedAt + retentionDays. retention 0 = keep forever.

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whole days until a trashed doc is permanently purged, or null when it is never
 * purged (retention 0) or the trashedAt is missing/invalid. Clamps to 0 once the
 * purge moment has passed; rounds UP a partial day so the last day reads as 1.
 * `now` is injectable for deterministic tests (defaults to Date.now()).
 */
export function daysUntilPurge(
  trashedAt: string | null | undefined,
  retentionDays: number,
  now: number = Date.now(),
): number | null {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return null
  if (!trashedAt) return null
  const trashedMs = Date.parse(trashedAt)
  if (Number.isNaN(trashedMs)) return null
  const purgeAt = trashedMs + retentionDays * DAY_MS
  const remainingMs = purgeAt - now
  if (remainingMs <= 0) return 0
  return Math.ceil(remainingMs / DAY_MS)
}

/** Human label for a purge countdown (null = kept forever). */
export function describePurge(days: number | null): string {
  if (days === null) return 'Kept forever'
  if (days <= 0) return 'Deletes soon'
  return `Deletes in ${days} ${days === 1 ? 'day' : 'days'}`
}
