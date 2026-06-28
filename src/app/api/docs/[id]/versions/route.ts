import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { resolveDocAccess } from '@/lib/authz/doc-access'
import { createVersion, listVersions } from '@/lib/docs/versions-repo'

export const dynamic = 'force-dynamic'

// GET /api/docs/[id]/versions — list version summaries (newest first)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await ctx.params
  // view access: owner, admin, or any doc-permission grant (viewer+) may read history.
  const doc = await resolveDocAccess(user, id, 'view')
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const versions = await listVersions(id)
  return NextResponse.json(versions)
}

// POST /api/docs/[id]/versions — snapshot the current doc state as a version
// Body: { kind: 'auto' | 'named', label?: string }
// The route reads the CURRENT doc content+markdown and creates the snapshot,
// so the client just fires the trigger; the server captures the state.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await ctx.params
  // edit access required: snapshotting mutates the version history of the doc.
  const doc = await resolveDocAccess(user, id, 'edit')
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = (await req.json()) as { kind?: string; label?: string }
  const kind = body.kind === 'named' ? 'named' : 'auto'
  const label = kind === 'named' ? (body.label ?? null) : null

  const result = await createVersion(id, {
    kind,
    label,
    content: doc.content,
    markdown: doc.markdown,
    authorId: user.id,
  })

  return NextResponse.json(result, { status: 201 })
}
