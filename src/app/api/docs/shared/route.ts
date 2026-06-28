import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

// A4: the "Shared with me" listing — docs granted to the caller via
// document_permissions (not owned by them). Authenticated; each row is a doc the
// caller has at least viewer access to (the grant itself is the capability).
// Returns the rich row shape the FileManager's flat-list renderer expects
// (size/preview/starred/createdAt), joined through document_permissions.
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const rows = await db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      createdAt: schema.documents.createdAt,
      folderId: schema.documents.folderId,
      starred: schema.documents.starred,
      size: sql<number>`length(${schema.documents.markdown})`.as('size'),
      preview: sql<string>`left(${schema.documents.markdown}, 140)`.as('preview'),
    })
    .from(schema.documents)
    .innerJoin(
      schema.documentPermissions,
      eq(schema.documentPermissions.docId, schema.documents.id),
    )
    .where(and(eq(schema.documentPermissions.userId, user.id), isNull(schema.documents.trashedAt)))
    .orderBy(desc(schema.documents.updatedAt))

  return NextResponse.json(
    rows.map((d) => ({
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
