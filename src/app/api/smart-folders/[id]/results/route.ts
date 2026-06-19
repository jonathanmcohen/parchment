import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { authenticateRequest } from '@/lib/auth/guard'
import { parseCriteria } from '@/lib/docs/smart-folder-criteria'
import { runSmartFolder } from '@/lib/docs/smart-folders-repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
      starred: d.starred,
      folderId: d.folderId,
    })),
  )
}
