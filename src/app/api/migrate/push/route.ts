import { type NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { createWorkspaceBackup } from '@/lib/backup/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// D — instance-migrate SOURCE endpoint. Admin builds a workspace backup and
// POSTs it to ${targetUrl}/api/migrate/receive with a one-shot bearer token.
//
// The target URL MUST be https:// — a token over clear-text http would be a
// credential-leak vulnerability. The token is the caller's responsibility (not
// looked up from app_config): push is a one-shot op to an arbitrary target.

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const targetUrl = typeof body.targetUrl === 'string' ? body.targetUrl.trim() : ''
  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

  // https-only target.
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return NextResponse.json({ error: 'targetUrl must be a valid URL' }, { status: 400 })
  }
  if (parsed.protocol !== 'https:') {
    return NextResponse.json(
      { error: 'targetUrl must use https:// (refusing to send a token over http)' },
      { status: 400 },
    )
  }

  const dry = req.nextUrl.searchParams.get('dry') === 'true'
  const receiveUrl = `${stripTrailingSlash(targetUrl)}/api/migrate/receive${dry ? '?dry=true' : ''}`

  const bytes = await createWorkspaceBackup(user.id, new Date().toISOString())

  let res: Response
  try {
    res = await fetch(receiveUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/zip',
      },
      // Uint8Array is a valid BodyInit.
      body: bytes as unknown as BodyInit,
    })
  } catch (err) {
    // Network failure — sanitize (the token is never in an Error message, but be safe).
    let msg = err instanceof Error ? err.message : String(err)
    if (token && msg.includes(token)) msg = msg.split(token).join('***')
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }

  // Parse the target's JSON body (best-effort).
  let targetBody: unknown = null
  try {
    targetBody = await res.json()
  } catch {
    targetBody = null
  }

  if (!res.ok) {
    return NextResponse.json({ ok: false, targetStatus: res.status, targetBody })
  }

  await logAudit('migrate.push', {
    actorId: user.id,
    targetType: 'instance',
    targetId: parsed.host,
    meta: { dryRun: dry },
  })

  // Pass the target's result through (live restore result OR dry-run manifest).
  return NextResponse.json({ ok: true, ...asObject(targetBody) })
}

function stripTrailingSlash(u: string): string {
  return u.endsWith('/') ? u.slice(0, -1) : u
}

function asObject(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}
