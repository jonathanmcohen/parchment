import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { searchDocuments } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

/**
 * GET /api/docs/search?q=<query>
 * B6: fuzzy title search for the link-to-doc picker.
 * Returns [{ id, title }] (up to 10), scoped to the authenticated owner.
 * Empty or absent q → most recently updated docs.
 */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q') ?? ''
  const docs = await searchDocuments(user.id, q)
  const results = docs.map((d) => ({ id: d.id, title: d.title }))
  return NextResponse.json(results)
}
