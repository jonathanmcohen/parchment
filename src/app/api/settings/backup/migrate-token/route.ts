import { type NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { deleteAppConfig, getAppConfig, setAppConfig } from '@/lib/config/repo'
import { generateMigrateToken, hashMigrateToken } from '@/lib/migrate/token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KEY = 'migrate.tokenHash'

/** GET — is a receive token configured? Admin-only. Never returns the token/hash. */
export async function GET(req: NextRequest) {
  const guard = await requireAdminReq(req)
  if (guard) return guard
  const configured = (await getAppConfig(KEY)) !== null
  return NextResponse.json({ configured })
}

/**
 * POST — generate a NEW receive token (invalidating any previous one), store its
 * hash, and return the plaintext ONCE. Admin-only.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdminReq(req)
  if (guard) return guard
  const token = generateMigrateToken()
  await setAppConfig(KEY, hashMigrateToken(token))
  await logAudit('migrate.token', { targetType: 'migrate-token' })
  return NextResponse.json({ token })
}

/** DELETE — revoke (close) the receive endpoint. Admin-only. */
export async function DELETE(req: NextRequest) {
  const guard = await requireAdminReq(req)
  if (guard) return guard
  await deleteAppConfig(KEY)
  await logAudit('migrate.token', { targetType: 'migrate-token', meta: { revoked: true } })
  return NextResponse.json({ ok: true })
}

/** Shared admin gate — returns a 401/403 response to short-circuit, or null. */
async function requireAdminReq(req: NextRequest): Promise<NextResponse | null> {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return null
}
