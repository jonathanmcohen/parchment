import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { DocRow } from '@/lib/docs/repo'
import type { SmartCriteria } from '@/lib/docs/smart-folder-criteria'

export type SmartFolder = typeof schema.smartFolders.$inferSelect

export async function createSmartFolder(
  ownerId: string,
  opts: { name: string; criteria: SmartCriteria },
): Promise<{ id: string }> {
  if (!opts.name.trim()) throw new Error('empty name')
  const [row] = await db
    .insert(schema.smartFolders)
    .values({ ownerId, name: opts.name.trim(), criteria: opts.criteria })
    .returning({ id: schema.smartFolders.id })
  if (!row) throw new Error('createSmartFolder: insert returned no row')
  return { id: row.id }
}

export async function listSmartFolders(ownerId: string): Promise<SmartFolder[]> {
  return db
    .select()
    .from(schema.smartFolders)
    .where(eq(schema.smartFolders.ownerId, ownerId))
    .orderBy(desc(schema.smartFolders.createdAt))
}

export async function renameSmartFolder(ownerId: string, id: string, name: string): Promise<void> {
  await db
    .update(schema.smartFolders)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(schema.smartFolders.id, id), eq(schema.smartFolders.ownerId, ownerId)))
}

export async function updateSmartFolderCriteria(
  ownerId: string,
  id: string,
  criteria: SmartCriteria,
): Promise<void> {
  await db
    .update(schema.smartFolders)
    .set({ criteria, updatedAt: new Date() })
    .where(and(eq(schema.smartFolders.id, id), eq(schema.smartFolders.ownerId, ownerId)))
}

export async function deleteSmartFolder(ownerId: string, id: string): Promise<void> {
  await db
    .delete(schema.smartFolders)
    .where(and(eq(schema.smartFolders.id, id), eq(schema.smartFolders.ownerId, ownerId)))
}

/** Run a smart folder's criteria live → matching non-trashed docs (newest-first). */
export async function runSmartFolder(ownerId: string, criteria: SmartCriteria): Promise<DocRow[]> {
  const conditions = [eq(schema.documents.ownerId, ownerId), isNull(schema.documents.trashedAt)]

  if (criteria.titleContains !== undefined) {
    conditions.push(ilike(schema.documents.title, `%${criteria.titleContains}%`))
  }

  if (criteria.starred === true) {
    conditions.push(eq(schema.documents.starred, true))
  }

  if ('folderId' in criteria) {
    if (criteria.folderId === null) {
      conditions.push(isNull(schema.documents.folderId))
    } else if (criteria.folderId !== undefined) {
      conditions.push(eq(schema.documents.folderId, criteria.folderId))
    }
  }

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
    .where(and(...conditions))
    .orderBy(desc(schema.documents.updatedAt))
}
