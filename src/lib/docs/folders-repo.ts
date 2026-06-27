import { and, eq, ilike } from 'drizzle-orm'
import { db, schema } from '@/db'
import { wouldCreateCycle } from '@/lib/docs/folder-tree'

export type Folder = typeof schema.folders.$inferSelect

export async function createFolder(
  ownerId: string,
  opts: { name: string; parentId?: string | null },
): Promise<{ id: string }> {
  const name = opts.name.trim()
  if (name.length === 0) throw new Error('empty name')
  const [row] = await db
    .insert(schema.folders)
    .values({ ownerId, name, parentId: opts.parentId ?? null })
    .returning({ id: schema.folders.id })
  if (!row) throw new Error('createFolder: insert returned no row')
  return { id: row.id }
}

/** All folders owned by `ownerId` (flat). */
export async function listFolders(ownerId: string): Promise<Folder[]> {
  return db.select().from(schema.folders).where(eq(schema.folders.ownerId, ownerId))
}

/**
 * J6: resolve a folder NAME → its id for the owner (case-insensitive exact
 * match), or null when no such folder exists. Backs the `folder:bar` search
 * operator. If multiple folders share a name, the first by creation is used.
 */
export async function findFolderByName(ownerId: string, name: string): Promise<string | null> {
  const trimmed = name.trim()
  if (trimmed.length === 0) return null
  const [row] = await db
    .select({ id: schema.folders.id })
    .from(schema.folders)
    .where(and(eq(schema.folders.ownerId, ownerId), ilike(schema.folders.name, trimmed)))
    .limit(1)
  return row?.id ?? null
}

export async function renameFolder(ownerId: string, id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('empty name')
  await db
    .update(schema.folders)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(and(eq(schema.folders.id, id), eq(schema.folders.ownerId, ownerId)))
}

/**
 * Move folder under newParentId (null = root). Throws Error('cycle') if it would
 * create a cycle — load the owner's folders and check wouldCreateCycle first.
 * Caller (API) maps the throw to HTTP 409.
 */
export async function moveFolder(
  ownerId: string,
  id: string,
  newParentId: string | null,
): Promise<void> {
  const folders = await listFolders(ownerId)
  if (
    wouldCreateCycle(
      folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId })),
      id,
      newParentId,
    )
  ) {
    throw new Error('cycle')
  }
  await db
    .update(schema.folders)
    .set({ parentId: newParentId, updatedAt: new Date() })
    .where(and(eq(schema.folders.id, id), eq(schema.folders.ownerId, ownerId)))
}

/**
 * Delete a folder; reparent its direct child folders AND its docs to the
 * deleted folder's parent (so nothing is orphaned). Do it in a transaction.
 */
export async function deleteFolder(ownerId: string, id: string): Promise<void> {
  const [folder] = await db
    .select({ parentId: schema.folders.parentId })
    .from(schema.folders)
    .where(and(eq(schema.folders.id, id), eq(schema.folders.ownerId, ownerId)))
    .limit(1)
  if (!folder) return

  const parentId = folder.parentId

  await db.transaction(async (tx) => {
    // Reparent child folders
    await tx
      .update(schema.folders)
      .set({ parentId, updatedAt: new Date() })
      .where(eq(schema.folders.parentId, id))

    // Reparent child documents
    await tx
      .update(schema.documents)
      .set({ folderId: parentId, updatedAt: new Date() })
      .where(eq(schema.documents.folderId, id))

    // Delete the folder
    await tx
      .delete(schema.folders)
      .where(and(eq(schema.folders.id, id), eq(schema.folders.ownerId, ownerId)))
  })
}
