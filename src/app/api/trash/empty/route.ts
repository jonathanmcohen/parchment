import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { emptyTrash } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

/**
 * POST /api/trash/empty { confirm: string }
 * Server-side re-validates: confirm.trim().toLowerCase() must equal 'empty trash'.
 * Hard-deletes ALL trashed docs for the caller (trashed_at is not null, owner-scoped).
 */
export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as { confirm?: unknown }
  const phrase = typeof body.confirm === 'string' ? body.confirm.trim().toLowerCase() : ''

  if (phrase !== 'empty trash') {
    return NextResponse.json({ error: 'confirmation required' }, { status: 400 })
  }

  const purged = await emptyTrash(user.id)
  return NextResponse.json({ ok: true, purged })
}
