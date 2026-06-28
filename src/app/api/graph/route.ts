import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { graphEdges } from '@/lib/docs/doc-links-repo'

export const dynamic = 'force-dynamic'

/**
 * GET /api/graph — J5-2: the owner's wiki-link graph as { nodes, edges }.
 * Read-only → requires the `docs:read` scope (cookie sessions are full-access).
 * Owner-scoped: only the caller's own, non-trashed docs and the links between
 * them. 401 unauthenticated / 403 on a Bearer token lacking the scope.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const graph = await graphEdges(auth.user.id)
  return NextResponse.json(graph)
}
