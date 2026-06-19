import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { DocRow } from '@/lib/docs/repo'
import { DEFAULT_TAG_COLOR, isValidTagColor } from '@/lib/docs/tag-colors'

export type Tag = typeof schema.tags.$inferSelect

export async function createTag(
  ownerId: string,
  opts: { name: string; color?: string },
): Promise<{ id: string }> {
  if (!opts.name.trim()) throw new Error('empty name')
  const color =
    opts.color !== undefined && isValidTagColor(opts.color) ? opts.color : DEFAULT_TAG_COLOR
  const [row] = await db
    .insert(schema.tags)
    .values({ ownerId, name: opts.name.trim(), color })
    .returning({ id: schema.tags.id })
  if (!row) throw new Error('createTag: insert returned no row')
  return { id: row.id }
}

export async function listTags(ownerId: string): Promise<Tag[]> {
  return db
    .select()
    .from(schema.tags)
    .where(eq(schema.tags.ownerId, ownerId))
    .orderBy(desc(schema.tags.createdAt))
}

export async function renameTag(ownerId: string, id: string, name: string): Promise<void> {
  await db
    .update(schema.tags)
    .set({ name })
    .where(and(eq(schema.tags.id, id), eq(schema.tags.ownerId, ownerId)))
}

export async function setTagColor(ownerId: string, id: string, color: string): Promise<void> {
  const safeColor = isValidTagColor(color) ? color : DEFAULT_TAG_COLOR
  await db
    .update(schema.tags)
    .set({ color: safeColor })
    .where(and(eq(schema.tags.id, id), eq(schema.tags.ownerId, ownerId)))
}

export async function deleteTag(ownerId: string, id: string): Promise<void> {
  // cascade removes document_tags rows via FK
  await db.delete(schema.tags).where(and(eq(schema.tags.id, id), eq(schema.tags.ownerId, ownerId)))
}

export async function addTagToDoc(ownerId: string, docId: string, tagId: string): Promise<void> {
  // Verify the doc belongs to ownerId
  const [doc] = await db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(and(eq(schema.documents.id, docId), eq(schema.documents.ownerId, ownerId)))
    .limit(1)
  if (!doc) throw new Error('doc not found or not owned')

  // Verify the tag belongs to ownerId
  const [tag] = await db
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(and(eq(schema.tags.id, tagId), eq(schema.tags.ownerId, ownerId)))
    .limit(1)
  if (!tag) throw new Error('tag not found or not owned')

  // Idempotent insert — ignore conflict on composite PK
  await db.insert(schema.documentTags).values({ docId, tagId }).onConflictDoNothing()
}

export async function removeTagFromDoc(
  ownerId: string,
  docId: string,
  tagId: string,
): Promise<void> {
  // Verify the doc belongs to ownerId
  const [doc] = await db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(and(eq(schema.documents.id, docId), eq(schema.documents.ownerId, ownerId)))
    .limit(1)
  if (!doc) throw new Error('doc not found or not owned')

  // Verify the tag belongs to ownerId
  const [tag] = await db
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(and(eq(schema.tags.id, tagId), eq(schema.tags.ownerId, ownerId)))
    .limit(1)
  if (!tag) throw new Error('tag not found or not owned')

  await db
    .delete(schema.documentTags)
    .where(and(eq(schema.documentTags.docId, docId), eq(schema.documentTags.tagId, tagId)))
}

export async function listTagsForDoc(ownerId: string, docId: string): Promise<Tag[]> {
  // Verify doc ownership
  const [doc] = await db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(and(eq(schema.documents.id, docId), eq(schema.documents.ownerId, ownerId)))
    .limit(1)
  if (!doc) return []

  return db
    .select({
      id: schema.tags.id,
      ownerId: schema.tags.ownerId,
      name: schema.tags.name,
      color: schema.tags.color,
      createdAt: schema.tags.createdAt,
    })
    .from(schema.tags)
    .innerJoin(schema.documentTags, eq(schema.documentTags.tagId, schema.tags.id))
    .where(and(eq(schema.documentTags.docId, docId), eq(schema.tags.ownerId, ownerId)))
    .orderBy(desc(schema.tags.createdAt))
}

export async function listDocsForTag(ownerId: string, tagId: string): Promise<DocRow[]> {
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      folderId: schema.documents.folderId,
      starred: schema.documents.starred,
    })
    .from(schema.documents)
    .innerJoin(schema.documentTags, eq(schema.documentTags.docId, schema.documents.id))
    .where(
      and(
        eq(schema.documentTags.tagId, tagId),
        eq(schema.documents.ownerId, ownerId),
        isNull(schema.documents.trashedAt),
      ),
    )
    .orderBy(desc(schema.documents.updatedAt))
}

/** tagId → count of (non-trashed) docs, for sidebar counts. */
export async function tagCounts(ownerId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({
      tagId: schema.documentTags.tagId,
      cnt: count(schema.documentTags.docId),
    })
    .from(schema.documentTags)
    .innerJoin(schema.documents, eq(schema.documents.id, schema.documentTags.docId))
    .innerJoin(schema.tags, eq(schema.tags.id, schema.documentTags.tagId))
    .where(and(eq(schema.tags.ownerId, ownerId), isNull(schema.documents.trashedAt)))
    .groupBy(schema.documentTags.tagId)

  const result: Record<string, number> = {}
  for (const row of rows) {
    result[row.tagId] = row.cnt
  }
  return result
}
