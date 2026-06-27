/**
 * Maintenance mode — lock-file based (I6).
 *
 * The preferred approach (§I6-T1) uses a lock file rather than a DB settings
 * row. Advantages:
 *   - Works even when the DB is down (exactly when you need maintenance mode).
 *   - No sentinel-UUID schema complication.
 *   - isMaintenanceMode() is a synchronous fs.existsSync call — fast for
 *     every middleware tick.
 *
 * Lock file path: `${lockDir}/maintenance.lock`
 * lockDir defaults to env.lockDir (PARCHMENT_LOCK_DIR env) or, if unset, to
 * the parent of env.filesRoot (sibling directory on the same volume).
 *
 * The module exports two surfaces:
 *   1. makeMaintenanceFns(dir) → { isMaintenanceMode, setMaintenanceMode }
 *      — injectable factory for testing with a temp directory.
 *   2. isMaintenanceMode() / setMaintenanceMode(enabled, actorId)
 *      — process-wide singletons that read lockDir from env.
 */

import { existsSync } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'

const LOCK_FILE_NAME = 'maintenance.lock'

/** Injectable factory — used by tests with a temp directory. */
export function makeMaintenanceFns(lockDir: string): {
  isMaintenanceMode: () => Promise<boolean>
  setMaintenanceMode: (enabled: boolean, actorId: string) => Promise<void>
} {
  const lockFile = join(lockDir, LOCK_FILE_NAME)

  async function isMaintenanceMode(): Promise<boolean> {
    return existsSync(lockFile)
  }

  async function setMaintenanceMode(enabled: boolean, _actorId: string): Promise<void> {
    if (enabled) {
      // Ensure the directory exists (may not exist on first boot).
      await mkdir(lockDir, { recursive: true })
      // idempotent — writeFile with no error if already exists
      await writeFile(lockFile, `maintenance lock\n`, { flag: 'w' })
    } else {
      // Remove lock file; idempotent — ignore ENOENT
      try {
        await unlink(lockFile)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
    }
  }

  return { isMaintenanceMode, setMaintenanceMode }
}

// ── Process-wide singleton ────────────────────────────────────────────────────

function getDefaultLockDir(): string {
  // Lazy import env to avoid circular dep at module load time.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require('@/lib/env') as { env: { lockDir: string; filesRoot: string } }
    if (env.lockDir) return env.lockDir
    // Fall back to parent of filesRoot so it's on the same volume.
    return dirname(env.filesRoot)
  } catch {
    // Fallback for edge runtime / test environments where require is unavailable.
    return process.env.PARCHMENT_LOCK_DIR || dirname(process.env.PARCHMENT_FILES_ROOT || '/data/parchment/files')
  }
}

const _singleton = makeMaintenanceFns(getDefaultLockDir())

/**
 * Returns true when maintenance mode is active (lock file exists).
 * Called by middleware on every matched request — fast synchronous check
 * wrapped in a Promise for compatibility with async middleware.
 */
export async function isMaintenanceMode(): Promise<boolean> {
  return _singleton.isMaintenanceMode()
}

/**
 * Enable or disable maintenance mode. Creates or removes the lock file.
 * actorId is recorded for audit purposes (passed to logAudit by callers).
 */
export async function setMaintenanceMode(enabled: boolean, actorId: string): Promise<void> {
  return _singleton.setMaintenanceMode(enabled, actorId)
}
