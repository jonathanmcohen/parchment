import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { addTagToDoc, listTagsForDoc, removeTagFromDoc } from '@/lib/docs/tags-repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id: docId } = await params
  const tags = await listTagsForDoc(user.id, docId)

  return NextResponse.json(
    tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
    })),
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id: docId } = await params
  const body = (await req.json()) as { tagId?: unknown }
  const tagId = typeof body.tagId === 'string' ? body.tagId : ''
  if (!tagId) return NextResponse.json({ error: 'tagId is required' }, { status: 400 })

  try {
    await addTagToDoc(user.id, docId, tagId)
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    throw err
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id: docId } = await params

  // Accept tagId from body or query param
  let tagId: string | undefined
  const qp = req.nextUrl.searchParams.get('tagId')
  if (qp) {
    tagId = qp
  } else {
    try {
      const body = (await req.json()) as { tagId?: unknown }
      if (typeof body.tagId === 'string') tagId = body.tagId
    } catch {
      // ignore parse error — body may be empty
    }
  }

  if (!tagId) return NextResponse.json({ error: 'tagId is required' }, { status: 400 })

  try {
    await removeTagFromDoc(user.id, docId, tagId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    throw err
  }
}
