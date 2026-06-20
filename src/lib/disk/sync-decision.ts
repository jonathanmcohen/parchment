// F2: pure decision logic for the reverse-sync watcher. No fs, no db, no React.
// Tested in tests/unit/sync-decision.test.ts.

export type ChangeClass = 'echo' | 'apply' | 'conflict'

/**
 * Classify a file change from the three hashes (all sha256 of markdown):
 *   - `fileHash`   — sha256 of the current on-disk file content.
 *   - `dbHash`     — sha256 of `documents.markdown` (the DB's view).
 *   - `syncedHash` — sha256 of the markdown last known to be IN SYNC between
 *                    DB and disk (set whenever either side writes the other);
 *                    null/undefined when the doc has never been synced.
 *
 * Rules (see Plan F / F2 architecture):
 *   fileHash === syncedHash            → 'echo'      (our own write echoed back, or a no-op)
 *   else dbHash === syncedHash         → 'apply'     (file diverged, DB didn't → external edit)
 *   else                               → 'conflict'  (both diverged since last sync)
 *
 * With `syncedHash == null` it can never equal a real hash, so a brand-new
 * managed file whose content matches the DB classifies as 'apply' the first
 * time (acceptable / documented), and one that differs from the DB as
 * 'conflict'.
 */
export function classifyChange(
  fileHash: string,
  dbHash: string,
  syncedHash: string | null | undefined,
): ChangeClass {
  // Never-synced doc: the baseline is unknown, so it can be neither an echo nor
  // a "DB unchanged since sync" apply by hash-equality. Fall back to comparing
  // the file directly against the DB — matches → first-time apply, else conflict.
  if (syncedHash == null) {
    return fileHash === dbHash ? 'apply' : 'conflict'
  }
  if (fileHash === syncedHash) return 'echo'
  if (dbHash === syncedHash) return 'apply'
  return 'conflict'
}
