import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { db, schema } from '@/db'

// F6: doc_links data layer — the wiki-link graph. No 'server-only' guard so the
// repo stays integration-testable; it touches `db` (pg) and is only imported by
// server routes / the save path in app code.

export type Backlink = { id: string; title: string }

/**
 * Replace the outgoing wiki links for `sourceId` with exactly `targetIds`.
 *
 * Implemented as a delete-all-then-reinsert so the row set always reflects the
 * current document. Targets are filtered to: (a) existing documents (the FK
 * would otherwise reject the whole insert) and (b) not the source itself (a doc
 * linking to itself is meaningless for backlinks). Deduped defensively.
 *
 * Best-effort: callers in the save path wrap this so an index failure never
 * breaks the document save.
 */
export async function setDocLinks(sourceId: string, targetIds: string[]): Promise<void> {
  // Always clear existing rows first so a doc that lost all its links ends empty.
  await db.delete(schema.docLinks).where(eq(schema.docLinks.sourceDocId, sourceId))

  const unique = Array.from(new Set(targetIds)).filter((t) => t.length > 0 && t !== sourceId)
  if (unique.length === 0) return

  // Keep only targets that actually exist, so the FK insert cannot fail on a
  // stale id (e.g. a link to a since-deleted doc).
  const existing = await db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(inArray(schema.documents.id, unique))
  const existingIds = new Set(existing.map((r) => r.id))
  const rows = unique
    .filter((t) => existingIds.has(t))
    .map((t) => ({ sourceDocId: sourceId, targetDocId: t }))
  if (rows.length === 0) return

  await db.insert(schema.docLinks).values(rows).onConflictDoNothing()
}

/**
 * The source documents (id + title) that link TO `targetDocId`, owner-scoped via
 * a join to documents. Trashed source docs are excluded. Ordered by title.
 */
export async function backlinks(targetDocId: string, ownerId: string): Promise<Backlink[]> {
  return db
    .select({ id: schema.documents.id, title: schema.documents.title })
    .from(schema.docLinks)
    .innerJoin(schema.documents, eq(schema.documents.id, schema.docLinks.sourceDocId))
    .where(
      and(
        eq(schema.docLinks.targetDocId, targetDocId),
        eq(schema.documents.ownerId, ownerId),
        ne(schema.documents.id, targetDocId),
        isNull(schema.documents.trashedAt),
      ),
    )
    .orderBy(schema.documents.title)
}
