import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocument, restoreDocument } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  await restoreDocument(user.id, id)
  return NextResponse.json({ ok: true })
}
