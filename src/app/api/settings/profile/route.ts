import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

// V2: persist the owner's editable profile fields. v0.1.4 ships the display
// NAME only — email is the login identity and there is no verification flow yet,
// so it stays read-only on the Account page (the input is disabled). The body is
// deliberately narrow ({ name }) so a later email-change feature is an additive
// change, not a security regression here.
const MAX_NAME_LENGTH = 100

// PUT /api/settings/profile { name } — update the authenticated user's display
// name. Session OR PAT may call it (it is a personal-profile write, not a
// credential rotation), so plain authenticateRequest is fine.
export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = null
  }

  const raw = body && typeof body === 'object' ? (body as { name?: unknown }).name : undefined
  if (typeof raw !== 'string') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const name = raw.trim()
  if (name.length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 })
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: 'name_too_long' }, { status: 400 })
  }

  await db.update(schema.users).set({ name }).where(eq(schema.users.id, user.id))
  return NextResponse.json({ name })
}
