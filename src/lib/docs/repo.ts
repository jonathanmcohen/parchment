import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/db'

// B0 document lifecycle. No 'server-only' guard so the repo stays unit-testable;
// it touches `db` (pg) and is only imported by server routes/components in app code.

export type DocSummary = { id: string; title: string; updatedAt: Date }
export type Doc = typeof schema.documents.$inferSelect

export async function createDocument(
  ownerId: string,
  opts: { title?: string; folderId?: string } = {},
): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.documents)
    .values({
      ownerId,
      title: opts.title ?? 'Untitled',
      ...(opts.folderId ? { folderId: opts.folderId } : {}),
    })
    .returning({ id: schema.documents.id })
  if (!row) throw new Error('createDocument: insert returned no row')
  return { id: row.id }
}

export async function saveDocument(
  id: string,
  data: { contentJson: unknown; markdown: string; title?: string },
): Promise<void> {
  await db
    .update(schema.documents)
    .set({
      content: data.contentJson,
      markdown: data.markdown,
      ...(data.title ? { title: data.title } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.documents.id, id))
}

export async function getDocument(id: string): Promise<Doc | null> {
  const [row] = await db.select().from(schema.documents).where(eq(schema.documents.id, id)).limit(1)
  return row ?? null
}

export async function listDocuments(ownerId: string): Promise<DocSummary[]> {
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
    })
    .from(schema.documents)
    .where(and(eq(schema.documents.ownerId, ownerId), isNull(schema.documents.trashedAt)))
    .orderBy(desc(schema.documents.updatedAt))
}
