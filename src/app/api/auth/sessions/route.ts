import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { listUserSessions } from '@/lib/auth/sessions-repo'

export const dynamic = 'force-dynamic'

// Listing the caller's own sessions is session-only — a PAT (Bearer) is for
// programmatic API use, not for enumerating the owner's browser sessions.
async function requireSessionUser(req: NextRequest) {
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return null
  return authenticateRequest(req)
}

// GET /api/auth/sessions — list the caller's active sessions (read-only). The
// response carries only id/createdAt/expiresAt/current; token hashes never leave
// the server (see sessions-repo).
export async function GET(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sessions = await listUserSessions(user.id)
  return NextResponse.json({ sessions })
}
