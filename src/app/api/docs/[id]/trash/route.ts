import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { getDocument, trashDocument } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  await trashDocument(user.id, id)
  return NextResponse.json({ ok: true })
}
