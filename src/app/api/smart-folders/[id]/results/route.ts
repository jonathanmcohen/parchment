import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { parseCriteria } from '@/lib/docs/smart-folder-criteria'
import { runSmartFolder } from '@/lib/docs/smart-folders-repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await params

  // Load the smart folder and confirm ownership
  const [sf] = await db
    .select()
    .from(schema.smartFolders)
    .where(and(eq(schema.smartFolders.id, id), eq(schema.smartFolders.ownerId, user.id)))
    .limit(1)

  if (!sf) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const criteria = parseCriteria(sf.criteria)
  const docs = await runSmartFolder(user.id, criteria)

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
