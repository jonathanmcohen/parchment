import { and, isNull, ne } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { authenticateRequest } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

// A4: a minimal people directory for the doc-sharing people-picker. Gated by an
// authenticated session/PAT (any signed-in user). Returns only id/name/email of
// OTHER active users — never roles, never password/token hashes, never disabledAt.
// This is an intentionally low-sensitivity directory needed for sharing.
export async function GET(req: NextRequest) {
  const me = await authenticateRequest(req)
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(and(ne(schema.users.id, me.id), isNull(schema.users.disabledAt)))
  return NextResponse.json({ users })
}
