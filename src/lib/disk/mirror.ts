// Disk-mirror write side (Plan F, F1). No 'server-only' guard so it stays
// unit/integration-testable; never import this into client components.
//
// IMPORTANT: mirror.ts queries the db directly (no import of repo.ts) to avoid
// a circular dependency. repo.ts → mirror.ts is a one-way dependency.

import { mkdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm'
import { db, schema } from '@/db'
import { folderPath } from '@/lib/docs/folder-tree'
import { listFolders } from '@/lib/docs/folders-repo'
import { disambiguate, docRelPath } from './paths'

/** Read the files root at call time so tests can override PARCHMENT_FILES_ROOT. */
function filesRoot(): string {
  return process.env.PARCHMENT_FILES_ROOT ?? `${process.env.HOME ?? '/data'}/parchment/files`
}

/** Absolute filesystem path for a relPath under the configured root. */
export function absPath(relPath: string): string {
  return join(filesRoot(), relPath)
}

/**
 * Mirror a doc to disk: compute its desired relPath from folder chain + title,
 * disambiguate against OTHER docs' disk_path (same owner), write the markdown,
 * update documents.disk_path. If the doc already had a different disk_path,
 * delete the old file (and prune now-empty parent dirs, best-effort). Returns
 * the new relPath or null on any failure. NEVER throws.
 */
export async function syncDocToDisk(docId: string): Promise<string | null> {
  try {
    // Load the doc directly from db (no repo import to avoid circular deps)
    const [doc] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, docId))
      .limit(1)

    if (!doc || doc.trashedAt !== null) {
      // Treat missing or trashed as removal
      await removeDocFromDisk(docId)
      return null
    }

    // Build folder chain → names
    const folders = await listFolders(doc.ownerId)
    const chain = doc.folderId ? folderPath(folders, doc.folderId) : []
    const folderNames = chain.map((f) => f.name)

    // Desired path
    const desired = docRelPath(folderNames, doc.title)

    // Collision set: other non-trashed docs of the same owner with a disk_path
    const others = await db
      .select({ diskPath: schema.documents.diskPath })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.ownerId, doc.ownerId),
          isNull(schema.documents.trashedAt),
          isNotNull(schema.documents.diskPath),
          ne(schema.documents.id, docId),
        ),
      )

    const taken = new Set(others.map((r) => (r.diskPath as string).toLowerCase()))
    const relPath = disambiguate(desired, taken)
    const abs = absPath(relPath)

    // Write the file
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, doc.markdown ?? '', 'utf8')

    // Remove old file if path changed
    const oldRelPath = doc.diskPath
    if (oldRelPath && oldRelPath !== relPath) {
      const oldAbs = absPath(oldRelPath)
      try {
        await rm(oldAbs, { force: true })
      } catch {
        // best-effort
      }
      // Prune empty ancestor dirs up to (not including) filesRoot
      const root = filesRoot()
      let dir = dirname(oldAbs)
      while (dir !== root && dir.startsWith(root)) {
        try {
          await rmdir(dir)
          dir = dirname(dir)
        } catch {
          // not empty or doesn't exist — stop
          break
        }
      }
    }

    // Update disk_path in db
    await db
      .update(schema.documents)
      .set({ diskPath: relPath })
      .where(eq(schema.documents.id, docId))

    return relPath
  } catch {
    // Any error is best-effort — never propagate
    return null
  }
}

/**
 * Remove a doc's mirrored file (best-effort) and clear disk_path. Never throws.
 */
export async function removeDocFromDisk(docId: string): Promise<void> {
  try {
    const [doc] = await db
      .select({ diskPath: schema.documents.diskPath })
      .from(schema.documents)
      .where(eq(schema.documents.id, docId))
      .limit(1)

    if (!doc?.diskPath) return

    const oldAbs = absPath(doc.diskPath)
    const root = filesRoot()

    try {
      await rm(oldAbs, { force: true })
    } catch {
      // best-effort
    }

    // Prune empty ancestor dirs
    let dir = dirname(oldAbs)
    while (dir !== root && dir.startsWith(root)) {
      try {
        await rmdir(dir)
        dir = dirname(dir)
      } catch {
        break
      }
    }

    // Clear disk_path
    await db.update(schema.documents).set({ diskPath: null }).where(eq(schema.documents.id, docId))
  } catch {
    // best-effort — never propagate
  }
}
