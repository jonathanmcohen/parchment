import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { listDocuments } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

/**
 * GET /api/docs/titles
 * E10: Returns all non-trashed document titles for the authenticated user.
 * Lightweight — just id + title — so the client can fuzzy-filter in-memory.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const docs = await listDocuments(user.id)
  const titles = docs.map((d) => ({ id: d.id, title: d.title }))
  return NextResponse.json(titles)
}
