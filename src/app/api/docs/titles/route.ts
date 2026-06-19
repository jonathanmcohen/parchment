import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { listDocuments } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

/**
 * GET /api/docs/titles
 * E10: Returns all non-trashed document titles for the authenticated user.
 * Lightweight — just id + title — so the client can fuzzy-filter in-memory.
 */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const docs = await listDocuments(user.id)
  const titles = docs.map((d) => ({ id: d.id, title: d.title }))
  return NextResponse.json(titles)
}
