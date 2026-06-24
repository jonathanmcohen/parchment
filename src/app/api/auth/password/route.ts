import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { authenticateRequest } from '@/lib/auth/guard'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { parseChangePasswordBody, validateNewPassword } from '@/lib/auth/password-policy'

export const dynamic = 'force-dynamic'

// Change-password is owner-only and guarded by a LIVE cookie session — a PAT
// (Bearer) must never be able to rotate the account password.
async function requireSessionUser(req: NextRequest) {
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return null
  return authenticateRequest(req)
}

// POST /api/auth/password { currentPassword, newPassword } — rotate the
// account password. Verifies the current password against the stored argon2id
// hash, validates the new password length, then hashes + persists the new one.
// Errors are intentionally coarse (no detail about which check failed beyond the
// validation/auth boundary) and never echo a hash.
export async function POST(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = null
  }

  const input = parseChangePasswordBody(body)
  if (!input) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const policyError = validateNewPassword(input.newPassword)
  if (policyError) return NextResponse.json({ error: policyError }, { status: 400 })

  // An account with no password set cannot "change" one via this route.
  if (!user.passwordHash) {
    return NextResponse.json({ error: 'no_password_set' }, { status: 409 })
  }

  const ok = await verifyPassword(user.passwordHash, input.currentPassword)
  if (!ok) return NextResponse.json({ error: 'invalid_current_password' }, { status: 400 })

  const newHash = await hashPassword(input.newPassword)
  await db.update(schema.users).set({ passwordHash: newHash }).where(eq(schema.users.id, user.id))

  return NextResponse.json({ ok: true })
}
