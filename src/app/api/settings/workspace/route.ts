import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getWorkspaceName, setWorkspaceName } from '@/lib/docs/settings-repo'

export const dynamic = 'force-dynamic'

/**
 * F7: GET /api/settings/workspace → { name: string }
 * Workspace NAME only — backed by the existing generic settings store (no DB
 * migration). Returns '' when unset.
 */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const name = await getWorkspaceName(user.id)
  return NextResponse.json({ name })
}

/**
 * F7: PUT /api/settings/workspace { name: string } → { ok: true, name }
 * The name is normalized (trim / collapse whitespace / length-cap) before it is
 * stored, so the persisted value is the value the GET will return on reload.
 */
export async function PUT(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null
  if (body === null || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name must be a string' }, { status: 400 })
  }

  const name = await setWorkspaceName(user.id, body.name)
  return NextResponse.json({ ok: true, name })
}
