import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { listDocsForTag } from '@/lib/docs/tags-repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await params
  const docs = await listDocsForTag(user.id, id)

  return NextResponse.json(
    docs.map((d) => ({
      id: d.id,
      title: d.title,
      updatedAt: d.updatedAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
      folderId: d.folderId,
      starred: d.starred,
      size: Number(d.size),
      preview: d.preview,
    })),
  )
}
