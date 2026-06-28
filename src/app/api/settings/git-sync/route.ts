import { type NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { getAppConfig, getAppConfigJson } from '@/lib/config/repo'
import { resolveGitSyncConfig, saveGitSyncConfig } from '@/lib/git/sync-config'
import { scheduler } from '@/lib/schedules/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — current git-sync config + last push/error status. Admin-only. The token
 * is NEVER returned (tokenSet boolean only).
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdminReq(req)
  if (guard) return guard

  const cfg = await resolveGitSyncConfig()
  const tokenSet = (await getAppConfig('git.token')) !== null
  const lastPush = await getAppConfigJson<{ oid: string; at: string }>('git.lastPush')
  const lastError = await getAppConfigJson<{ kind: string; at: string; message: string }>(
    'git.lastError',
  )

  // Read the raw stored config so we can report fields even when disabled (a
  // disabled config returns null from resolveGitSyncConfig).
  const stored = await getAppConfigJson<Record<string, unknown>>('git.config')

  return NextResponse.json({
    remoteUrl: cfg?.remoteUrl ?? (stored?.remoteUrl as string) ?? '',
    branch: cfg?.branch ?? (stored?.branch as string) ?? 'main',
    authorName: cfg?.authorName ?? (stored?.authorName as string) ?? 'Parchment',
    authorEmail: cfg?.authorEmail ?? (stored?.authorEmail as string) ?? 'parchment@localhost',
    scheduleHours: cfg?.scheduleHours ?? (stored?.scheduleHours as number) ?? 24,
    enabled: cfg?.enabled ?? Boolean(stored?.enabled),
    tokenSet,
    lastPush: lastPush ?? null,
    lastError: lastError ?? null,
  })
}

/**
 * PUT — save config + live re-register the git-sync job. Admin-only.
 * token === '' deletes the stored token (revoke); a real token is stored
 * encrypted. The token is never echoed back.
 */
export async function PUT(req: NextRequest) {
  const guard = await requireAdminReq(req)
  if (guard) return guard

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const enabled = Boolean(body.enabled)
  const scheduleHours = Number.isFinite(Number(body.scheduleHours))
    ? Math.max(0, Math.floor(Number(body.scheduleHours)))
    : 24

  await saveGitSyncConfig({
    enabled,
    scheduleHours,
    ...(typeof body.remoteUrl === 'string' ? { remoteUrl: body.remoteUrl.trim() } : {}),
    ...(typeof body.branch === 'string' ? { branch: body.branch.trim() } : {}),
    ...(typeof body.authorName === 'string' ? { authorName: body.authorName.trim() } : {}),
    ...(typeof body.authorEmail === 'string' ? { authorEmail: body.authorEmail.trim() } : {}),
    // token: '' revokes; a string sets it; absent leaves it unchanged.
    ...(typeof body.token === 'string' ? { token: body.token } : {}),
  })

  scheduler.reconfigureGitSyncJob(enabled, scheduleHours)
  await logAudit('gitsync.config', { targetType: 'git-sync' })
  return NextResponse.json({ ok: true })
}

/** Shared admin gate. */
async function requireAdminReq(req: NextRequest): Promise<NextResponse | null> {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return null
}
