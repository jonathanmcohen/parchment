import { type NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { parseWorkspaceBackup, restoreWorkspaceBackup } from '@/lib/backup/service'
import { getAppConfig } from '@/lib/config/repo'
import { countDocuments, getFirstAdminUser } from '@/lib/migrate/admin'
import { verifyMigrateToken } from '@/lib/migrate/token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// D — instance-migrate TARGET endpoint. WRITES files (restoreWorkspaceBackup),
// authenticated ONLY by the encrypted MIGRATE_TOKEN bearer (NOT a user session).
// The token is compared constant-time; the body is size-capped; the manifest is
// validated (via parseWorkspaceBackup) before any write; every receive is audited.
//
// Known limitation (single-owner v0.2.0): the restore targets the FIRST admin
// user. Multi-user v0.2.x will add a targetUserId param.

const MAX_BYTES = 100 * 1024 * 1024 // 100 MB

export async function POST(req: NextRequest) {
  // 1. Bearer token required.
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const incoming = auth.slice('Bearer '.length).trim()

  // 2. No configured token → the receive endpoint is closed.
  const storedHash = await getAppConfig('migrate.tokenHash')
  if (!storedHash) {
    return NextResponse.json({ error: 'receive endpoint not configured' }, { status: 401 })
  }

  // 3. Constant-time token check.
  if (!verifyMigrateToken(incoming, storedHash)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // 4. Resolve the target user (first admin).
  const admin = await getFirstAdminUser()
  if (!admin) {
    return NextResponse.json({ error: 'no admin user to receive into' }, { status: 409 })
  }

  // 5. Size cap (header fast-path before buffering).
  const contentLength = req.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) > MAX_BYTES) {
    return NextResponse.json({ error: 'payload too large (max 100 MB)' }, { status: 413 })
  }

  const buf = await req.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'payload too large (max 100 MB)' }, { status: 413 })
  }
  const bytes = new Uint8Array(buf)

  const dry = req.nextUrl.searchParams.get('dry') === 'true'

  // 6. Dry-run: validate + diff WITHOUT writing.
  if (dry) {
    let wouldCreate: number
    try {
      const parsed = await parseWorkspaceBackup(bytes)
      wouldCreate = parsed.entries.length
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'invalid backup' },
        { status: 400 },
      )
    }
    const existingCount = await countDocuments(admin.id)
    return NextResponse.json({
      dryRun: true,
      wouldCreate,
      // Restore is additive (never overwrites), so nothing in the backup is skipped
      // on a fresh receive; existingCount lets the caller gauge the merge.
      wouldSkip: 0,
      existingCount,
    })
  }

  // 7. Real restore.
  let result: Awaited<ReturnType<typeof restoreWorkspaceBackup>>
  try {
    result = await restoreWorkspaceBackup(admin.id, bytes)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'invalid backup' },
      { status: 400 },
    )
  }

  // Audit every successful receive (no secret/token in the meta).
  await logAudit('migrate.receive', {
    actorId: admin.id,
    targetType: 'workspace',
    meta: { created: result.created, skipped: result.skipped, warnings: result.warnings.length },
  })

  return NextResponse.json(result, { status: 200 })
}
