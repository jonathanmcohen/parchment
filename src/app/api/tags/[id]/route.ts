import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { deleteTag, renameTag, setTagColor } from '@/lib/docs/tags-repo'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await params
  const body = (await req.json()) as { name?: unknown; color?: unknown }

  if (typeof body.name === 'string') {
    await renameTag(user.id, id, body.name)
  }

  if (typeof body.color === 'string') {
    await setTagColor(user.id, id, body.color)
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await params
  await deleteTag(user.id, id)
  return NextResponse.json({ ok: true })
}
