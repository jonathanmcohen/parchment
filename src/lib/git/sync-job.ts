import 'server-only'

// E — the git-sync scheduler job. Reads the config; if unconfigured it is a
// silent no-op (off-unless-configured — the job stays registered as a fast
// no-op). If configured it pushes; on success it records git.lastPush, and on
// ANY push failure it records git.lastError AND throws so the scheduler marks
// lastStatus:'error'. A non-fast-forward is surfaced, never auto-resolved.

import { setAppConfigJson } from '@/lib/config/repo'
import { pushToRemote } from '@/lib/git/remote'
import { resolveGitSyncConfig } from '@/lib/git/sync-config'

export async function gitSyncJob(): Promise<void> {
  const config = await resolveGitSyncConfig()
  if (!config) return // unconfigured → no-op, no throw

  const result = await pushToRemote(config)
  const at = new Date().toISOString()

  if (result.ok) {
    await setAppConfigJson('git.lastPush', { oid: result.oid, at })
    return
  }

  await setAppConfigJson('git.lastError', { kind: result.error, at, message: result.message })
  throw new Error(`git-sync push failed (${result.error}): ${result.message}`)
}
