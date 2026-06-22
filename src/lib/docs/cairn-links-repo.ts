import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/db'
import { sanitizeCairnPageId } from '@/lib/integrations/cairn'

// J1: cairn_links data layer — the Cairn cross-link graph (Parchment doc →
// EXTERNAL Cairn page). Mirrors doc-links-repo.ts (setDocLinks/backlinks), but a
// Cairn target is an external pageId string, NOT a documents FK — so it lives in
// its own cairn_links table. No 'server-only' guard so the repo stays
// integration-testable; it touches `db` (pg) and is imported only by server
// routes / the save path in app code.

export type CairnBacklink = { docId: string; title: string }

/**
 * Replace the outgoing Cairn links for `sourceId` with exactly `pageIds`.
 *
 * Delete-all-then-reinsert so the row set always reflects the current document.
 * pageIds are sanitized (traversal / injection / overlong rejected → dropped)
 * and deduped before insert, so a hostile id never reaches the DB. There is no
 * FK existence check (Cairn pages are external and unknown to Parchment) — the
 * pageId is stored verbatim once it passes sanitization.
 *
 * ATOMIC: delete + insert run inside a single db.transaction so the replace is
 * all-or-nothing (mirrors setDocLinks). Callers in the save path wrap this so an
 * index failure never breaks the document save; the transaction guarantees the
 * row set is never left half-replaced within an attempt.
 */
export async function setCairnLinks(sourceId: string, pageIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    // Always clear existing rows first so a doc that lost all its Cairn links ends empty.
    await tx.delete(schema.cairnLinks).where(eq(schema.cairnLinks.sourceDocId, sourceId))

    const safe = pageIds.map((p) => sanitizeCairnPageId(p)).filter((p): p is string => p !== null)
    const unique = Array.from(new Set(safe))
    if (unique.length === 0) return

    const rows = unique.map((pageId) => ({ sourceDocId: sourceId, pageId }))
    await tx.insert(schema.cairnLinks).values(rows).onConflictDoNothing()
  })
}

/**
 * The Parchment documents (id + title) that link TO `pageId` (a Cairn page),
 * owner-scoped via a join to documents. Trashed source docs are excluded.
 * Ordered by title. This is what Cairn polls for bidirectional backlinks. An
 * invalid pageId yields [] (never queries with an unsafe value).
 */
export async function cairnBacklinks(pageId: string, ownerId: string): Promise<CairnBacklink[]> {
  const safe = sanitizeCairnPageId(pageId)
  if (safe === null) return []
  return db
    .select({ docId: schema.documents.id, title: schema.documents.title })
    .from(schema.cairnLinks)
    .innerJoin(schema.documents, eq(schema.documents.id, schema.cairnLinks.sourceDocId))
    .where(
      and(
        eq(schema.cairnLinks.pageId, safe),
        eq(schema.documents.ownerId, ownerId),
        isNull(schema.documents.trashedAt),
      ),
    )
    .orderBy(schema.documents.title)
}
