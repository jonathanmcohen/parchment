import { type NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { pushToRemote } from '@/lib/git/remote'
import { resolveGitSyncConfig } from '@/lib/git/sync-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST — push to the remote right now. Admin-only. Returns the PushResult
 * (the token is never echoed by pushToRemote). 400 when not configured.
 */
export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const cfg = await resolveGitSyncConfig()
  if (!cfg) return NextResponse.json({ error: 'git_sync_not_configured' }, { status: 400 })

  const result = await pushToRemote(cfg)
  await logAudit('gitsync.push', {
    actorId: user.id,
    targetType: 'git-sync',
    meta: { ok: result.ok },
  })
  return NextResponse.json(result)
}
