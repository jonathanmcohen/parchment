import 'server-only'

// I3 — backup-verify scheduled job (backup-sync OWNS this; §7l/§1g). Builds a
// real workspace backup for the first user, then PARSES it back. A clean parse
// records verify.lastResult ok:true. Any warning or a parse failure records the
// result AND throws so the scheduler marks lastStatus:'error' (partial corruption
// is treated as an error). A fresh install with no users records 'skipped' and
// does NOT throw.

import { db, schema } from '@/db'
import { parseWorkspaceBackup } from '@/lib/backup/archive' // already exists — DO NOT recreate
import { setAppConfigJson } from '@/lib/config/repo'
import { createWorkspaceBackup } from './service'

export async function backupVerifyJob(): Promise<void> {
  const [firstUser] = await db.select({ id: schema.users.id }).from(schema.users).limit(1)
  if (!firstUser) {
    await setAppConfigJson('verify.lastResult', { ok: 'skipped', at: new Date().toISOString() })
    return
  }

  const at = new Date().toISOString()
  const bytes = await createWorkspaceBackup(firstUser.id, at)

  let parsed: Awaited<ReturnType<typeof parseWorkspaceBackup>>
  try {
    parsed = await parseWorkspaceBackup(bytes) // throws on a fundamentally corrupt backup
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await setAppConfigJson('verify.lastResult', { ok: false, error: message, at })
    throw new Error(`Backup verify failed: ${message}`)
  }

  if (parsed.warnings.length > 0) {
    await setAppConfigJson('verify.lastResult', {
      ok: 'warn',
      warnings: parsed.warnings,
      docCount: parsed.entries.length,
      at,
    })
    throw new Error(
      `Backup verify found ${parsed.warnings.length} warning(s): ${parsed.warnings[0]}`,
    )
  }

  await setAppConfigJson('verify.lastResult', {
    ok: true,
    docCount: parsed.entries.length,
    at,
  })
}
