import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import { db, schema } from '@/db'

// B0 document lifecycle. No 'server-only' guard so the repo stays unit-testable;
// it touches `db` (pg) and is only imported by server routes/components in app code.

export type DocSummary = { id: string; title: string; updatedAt: Date; folderId: string | null }
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

/**
 * D4: Does the collab server already hold a persisted Yjs snapshot for this doc?
 * The editor uses this as the authoritative gate for first-open seeding: when a
 * snapshot exists the server is the source of truth and the client must NOT seed
 * from `documents.content` (doing so races the server sync and duplicates
 * content). When it's absent, this is a never-collaborated doc and the client
 * seeds it from the stored ProseMirror JSON.
 */
export async function hasCollabState(docId: string): Promise<boolean> {
  const [row] = await db
    .select({ name: schema.collabState.name })
    .from(schema.collabState)
    .where(eq(schema.collabState.name, docId))
    .limit(1)
  return row !== undefined
}

export async function listDocuments(ownerId: string): Promise<DocSummary[]> {
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      folderId: schema.documents.folderId,
    })
    .from(schema.documents)
    .where(and(eq(schema.documents.ownerId, ownerId), isNull(schema.documents.trashedAt)))
    .orderBy(desc(schema.documents.updatedAt))
}

/**
 * B6: fuzzy (case-insensitive substring) title search for the link-to-doc picker.
 * Empty `q` → returns the most recently updated docs (up to `limit`).
 */
export async function searchDocuments(
  ownerId: string,
  q: string,
  limit = 10,
): Promise<DocSummary[]> {
  const baseWhere = and(eq(schema.documents.ownerId, ownerId), isNull(schema.documents.trashedAt))
  const where =
    q.trim().length === 0
      ? baseWhere
      : and(baseWhere, or(ilike(schema.documents.title, `%${q.trim()}%`)))
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      folderId: schema.documents.folderId,
    })
    .from(schema.documents)
    .where(where)
    .orderBy(desc(schema.documents.updatedAt))
    .limit(limit)
}

/** Docs directly inside `folderId` (null = root), newest-first, excludes trashed. */
export async function listDocumentsInFolder(
  ownerId: string,
  folderId: string | null,
): Promise<DocSummary[]> {
  const folderCondition =
    folderId === null ? isNull(schema.documents.folderId) : eq(schema.documents.folderId, folderId)
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      folderId: schema.documents.folderId,
    })
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.ownerId, ownerId),
        isNull(schema.documents.trashedAt),
        folderCondition,
      ),
    )
    .orderBy(desc(schema.documents.updatedAt))
}

/** Move a doc to a folder (null = root). Owner-scoped by id. */
export async function moveDocument(id: string, folderId: string | null): Promise<void> {
  await db
    .update(schema.documents)
    .set({ folderId, updatedAt: new Date() })
    .where(eq(schema.documents.id, id))
}
