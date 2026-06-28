import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { backlinks } from '@/lib/docs/doc-links-repo'
import { getDocument } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * GET /api/docs/[id]/backlinks
 * F6: the documents that link TO this doc via [[wiki]] links.
 * Returns [{ id, title }], owner-scoped. 401 unauthenticated, 404 if the doc is
 * not found or not owned by the caller.
 */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user
  const { id } = await ctx.params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const rows = await backlinks(id, user.id)
  return NextResponse.json(rows)
}
