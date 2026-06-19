// D3 version history data layer. No 'server-only' guard so the repo stays unit-testable.
// Pure helpers + the JSON row type live in versions-shared.ts (client-safe).

import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { Version, VersionSummary } from '@/lib/docs/versions-shared'

export type { Version, VersionSummary }

// ─── createVersion ────────────────────────────────────────────────────────────

export async function createVersion(
  docId: string,
  opts: {
    kind: 'auto' | 'named'
    label?: string | null
    content: unknown
    markdown: string
    authorId?: string | null
  },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.docVersions)
    .values({
      docId,
      kind: opts.kind,
      label: opts.label ?? null,
      content: opts.content,
      markdown: opts.markdown,
      authorId: opts.authorId ?? null,
    })
    .returning({ id: schema.docVersions.id })

  if (!row) throw new Error('createVersion: insert returned no row')
  return { id: row.id }
}

// ─── listVersions ─────────────────────────────────────────────────────────────
// Returns summaries (no content) newest first.

export async function listVersions(docId: string): Promise<VersionSummary[]> {
  const rows = await db
    .select({
      id: schema.docVersions.id,
      label: schema.docVersions.label,
      kind: schema.docVersions.kind,
      createdAt: schema.docVersions.createdAt,
    })
    .from(schema.docVersions)
    .where(eq(schema.docVersions.docId, docId))
    .orderBy(desc(schema.docVersions.createdAt))

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    createdAt: r.createdAt.toISOString(),
  }))
}

// ─── getVersion ───────────────────────────────────────────────────────────────
// Returns full version including content + markdown.

export async function getVersion(id: string): Promise<Version | null> {
  const [row] = await db
    .select()
    .from(schema.docVersions)
    .where(eq(schema.docVersions.id, id))
    .limit(1)

  if (!row) return null
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    content: row.content,
    markdown: row.markdown,
  }
}

// ─── pruneAutosaves ───────────────────────────────────────────────────────────
// Deletes autosave rows beyond the newest `keep`, leaving named snapshots intact.

export async function pruneAutosaves(docId: string, keep = 50): Promise<void> {
  // Find the cutoff: the (keep+1)-th newest autosave row
  const rows = await db
    .select({ id: schema.docVersions.id })
    .from(schema.docVersions)
    .where(and(eq(schema.docVersions.docId, docId), eq(schema.docVersions.kind, 'auto')))
    .orderBy(desc(schema.docVersions.createdAt))
    .offset(keep)

  if (rows.length === 0) return

  const ids = rows.map((r) => r.id)
  // Delete those rows — drizzle doesn't have inArray with a plain array natively in all
  // versions, so we use sql template for safety:
  for (const id of ids) {
    await db.delete(schema.docVersions).where(eq(schema.docVersions.id, id))
  }
}
