import { and, desc, eq, ilike, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { removeDocFromDisk, syncDocToDisk } from '@/lib/disk/mirror'
import { extractTargetIds } from '@/lib/docs/doc-links'
import { setDocLinks } from '@/lib/docs/doc-links-repo'
import { embed, isSemanticEnabled } from '@/lib/search/embeddings'

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

  // F6: best-effort wiki-link index — extract this doc's [[wiki]] targets from
  // the PM JSON and replace its doc_links rows. A failure here must NEVER break
  // the save (e.g. a target referencing a since-deleted doc), so it is wrapped.
  try {
    const targetIds = extractTargetIds(data.contentJson)
    await setDocLinks(id, targetIds)
  } catch {
    // ignore — link indexing is best-effort
  }

  // Best-effort embedding generation — never blocks or fails the save.
  if (isSemanticEnabled()) {
    const title = data.title ?? ''
    const text = `${title}\n${data.markdown}`
    try {
      const v = await embed(text)
      if (v) {
        await db.update(schema.documents).set({ embedding: v }).where(eq(schema.documents.id, id))
      }
    } catch {
      // ignore — embedding is best-effort
    }
  }

  // Best-effort disk mirror — never blocks or fails the save.
  await syncDocToDisk(id)
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
): Promise<DocRow[]> {
  const folderCondition =
    folderId === null ? isNull(schema.documents.folderId) : eq(schema.documents.folderId, folderId)
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      folderId: schema.documents.folderId,
      starred: schema.documents.starred,
      createdAt: schema.documents.createdAt,
      size: sql<number>`length(${schema.documents.markdown})`.as('size'),
      preview: sql<string>`left(${schema.documents.markdown}, 140)`.as('preview'),
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

/** DocRow extends DocSummary with the `starred` flag, creation date, size, and preview. */
export type DocRow = DocSummary & {
  starred: boolean
  createdAt: Date
  size: number
  preview: string
}

/** N most-recently-updated non-trashed docs across all folders (default 30). */
export async function listRecents(ownerId: string, limit = 30): Promise<DocRow[]> {
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      folderId: schema.documents.folderId,
      starred: schema.documents.starred,
      createdAt: schema.documents.createdAt,
      size: sql<number>`length(${schema.documents.markdown})`.as('size'),
      preview: sql<string>`left(${schema.documents.markdown}, 140)`.as('preview'),
    })
    .from(schema.documents)
    .where(and(eq(schema.documents.ownerId, ownerId), isNull(schema.documents.trashedAt)))
    .orderBy(desc(schema.documents.updatedAt))
    .limit(limit)
}

/** Starred, non-trashed docs, newest-first. */
export async function listStarred(ownerId: string): Promise<DocRow[]> {
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      folderId: schema.documents.folderId,
      starred: schema.documents.starred,
      createdAt: schema.documents.createdAt,
      size: sql<number>`length(${schema.documents.markdown})`.as('size'),
      preview: sql<string>`left(${schema.documents.markdown}, 140)`.as('preview'),
    })
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.ownerId, ownerId),
        isNull(schema.documents.trashedAt),
        eq(schema.documents.starred, true),
      ),
    )
    .orderBy(desc(schema.documents.updatedAt))
}

/** Trashed docs (trashedAt not null), most-recently-trashed first. */
export async function listTrashed(ownerId: string): Promise<DocRow[]> {
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      folderId: schema.documents.folderId,
      starred: schema.documents.starred,
      createdAt: schema.documents.createdAt,
      size: sql<number>`length(${schema.documents.markdown})`.as('size'),
      preview: sql<string>`left(${schema.documents.markdown}, 140)`.as('preview'),
    })
    .from(schema.documents)
    .where(and(eq(schema.documents.ownerId, ownerId), isNotNull(schema.documents.trashedAt)))
    .orderBy(desc(schema.documents.trashedAt))
}

/** Toggle a doc's star (owner-scoped). */
export async function setStarred(ownerId: string, id: string, starred: boolean): Promise<void> {
  await db
    .update(schema.documents)
    .set({ starred, updatedAt: new Date() })
    .where(and(eq(schema.documents.id, id), eq(schema.documents.ownerId, ownerId)))
}

/** Soft-delete: set trashedAt = now (owner-scoped). */
export async function trashDocument(ownerId: string, id: string): Promise<void> {
  await db
    .update(schema.documents)
    .set({ trashedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.documents.id, id), eq(schema.documents.ownerId, ownerId)))

  // Best-effort disk mirror — remove the mirrored file.
  await removeDocFromDisk(id)
}

/** Restore: set trashedAt = null (owner-scoped). */
export async function restoreDocument(ownerId: string, id: string): Promise<void> {
  await db
    .update(schema.documents)
    .set({ trashedAt: null, updatedAt: new Date() })
    .where(and(eq(schema.documents.id, id), eq(schema.documents.ownerId, ownerId)))

  // Best-effort disk mirror — re-mirror on restore.
  await syncDocToDisk(id)
}

/**
 * E11: Permanently delete trashed docs older than `retentionDays` for this owner.
 * No-op if retentionDays <= 0. Only touches docs where trashedAt is not null.
 * Returns the count purged.
 */
export async function purgeExpiredTrash(ownerId: string, retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const result = await db
    .delete(schema.documents)
    .where(
      and(
        eq(schema.documents.ownerId, ownerId),
        isNotNull(schema.documents.trashedAt),
        lt(schema.documents.trashedAt, cutoff),
      ),
    )
  return result.rowCount ?? 0
}

/**
 * E11: Permanently delete ALL trashed docs for this owner.
 * Only touches docs where trashedAt is not null.
 * Returns the count deleted.
 */
export async function emptyTrash(ownerId: string): Promise<number> {
  const result = await db
    .delete(schema.documents)
    .where(and(eq(schema.documents.ownerId, ownerId), isNotNull(schema.documents.trashedAt)))
  return result.rowCount ?? 0
}

/** Move a doc to a folder (null = root). Owner-scoped by id. */
export async function moveDocument(id: string, folderId: string | null): Promise<void> {
  await db
    .update(schema.documents)
    .set({ folderId, updatedAt: new Date() })
    .where(eq(schema.documents.id, id))

  // Best-effort disk mirror — folder changed → relocate.
  await syncDocToDisk(id)
}

/** Rename a doc's title (owner-scoped). Rejects empty/whitespace title. */
export async function renameDocument(ownerId: string, id: string, title: string): Promise<void> {
  const trimmed = title.trim()
  if (trimmed.length === 0) throw new Error('empty title')
  await db
    .update(schema.documents)
    .set({ title: trimmed, updatedAt: new Date() })
    .where(and(eq(schema.documents.id, id), eq(schema.documents.ownerId, ownerId)))

  // Best-effort disk mirror — title changed → relocate.
  await syncDocToDisk(id)
}

/** Duplicate a doc: new row, title "{title} (copy)", same content/markdown/folderId,
 *  owned by ownerId, not trashed, not starred. Returns the new id. Throws if the
 *  source doc isn't owned by ownerId. */
export async function duplicateDocument(ownerId: string, id: string): Promise<{ id: string }> {
  const src = await getDocument(id)
  if (!src || src.ownerId !== ownerId) throw new Error('not found')
  const [row] = await db
    .insert(schema.documents)
    .values({
      ownerId,
      title: `${src.title} (copy)`,
      content: src.content,
      markdown: src.markdown ?? '',
      folderId: src.folderId ?? undefined,
      starred: false,
    })
    .returning({ id: schema.documents.id })
  if (!row) throw new Error('duplicateDocument: insert returned no row')

  // Best-effort disk mirror — write the copy.
  await syncDocToDisk(row.id)

  return { id: row.id }
}
