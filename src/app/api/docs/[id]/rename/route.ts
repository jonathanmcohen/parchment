import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocument, renameDocument } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const body = (await req.json()) as { title?: unknown }
  if (typeof body.title !== 'string' || body.title.trim().length === 0) {
    return NextResponse.json({ error: 'empty title' }, { status: 400 })
  }

  try {
    await renameDocument(user.id, id, body.title)
  } catch (err) {
    if (err instanceof Error && err.message === 'empty title') {
      return NextResponse.json({ error: 'empty title' }, { status: 400 })
    }
    throw err
  }

  return NextResponse.json({ ok: true })
}
