// Disk-mirror write side (Plan F, F1). No 'server-only' guard so it stays
// unit/integration-testable; never import this into client components.
//
// IMPORTANT: mirror.ts queries the db directly (no import of repo.ts) to avoid
// a circular dependency. repo.ts → mirror.ts is a one-way dependency.

import { mkdir, readdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm'
import { db, schema } from '@/db'
import { folderPath } from '@/lib/docs/folder-tree'
import { listFolders } from '@/lib/docs/folders-repo'
import { sha256 } from './hash'
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
    const markdown = doc.markdown ?? ''

    // Update disk_path + sync baseline in the DB BEFORE writing the file.
    //
    // The reverse-sync watcher (F2) resolves a doc by disk_path and classifies
    // the change against disk_synced_hash. If we wrote the file first and updated
    // the baseline afterward, there is a window where the new file is on disk but
    // the DB baseline still holds the OLD hash. chokidar's awaitWriteFinish fires
    // the watcher after the file settles; if it ran inside that window it would
    // see fileHash !== syncedHash, and — if the DB row was also touched
    // concurrently — misclassify the app's OWN write as a 'conflict' and emit a
    // spurious <name>.conflict-<ms>.md. Setting disk_synced_hash = sha256(markdown)
    // first means the watcher never observes a new file against a stale baseline:
    // worst case it reads the new baseline before the file lands and self-corrects
    // as an echo on the next settled event.
    await db
      .update(schema.documents)
      .set({ diskPath: relPath, diskSyncedHash: sha256(markdown) })
      .where(eq(schema.documents.id, docId))

    // Write the file
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, markdown, 'utf8')

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

    return relPath
  } catch {
    // Any error is best-effort — never propagate
    return null
  }
}

/**
 * v0.2.9 #3: sweep stale orphan `Release notes — v*.md` files from a guide
 * directory. The release-notes refresh recreates the doc under a FRESH id each
 * version; if an OLD file was ever left behind (e.g. prod's orphan
 * `Release notes — v0.1.0.md` from before removeDocFromDisk covered the recreate),
 * it lingers with no live doc. This removes any `Release notes — v*.md` in
 * `guideDirRel` whose basename is NOT in `keepBasenames` (the live docs' filenames).
 *
 * Deliberately narrow: it ONLY matches the managed `Release notes — v<...>.md`
 * naming so it can never delete a user doc, and never touches other guide docs.
 * Conflict siblings (`… .conflict-<ms>.md`) are also swept when orphaned, since
 * they belong to a since-removed release-notes file. Best-effort: returns the list
 * of removed POSIX relpaths (for logging/verification); NEVER throws.
 */
export async function sweepOrphanReleaseNotesFiles(
  guideDirRel: string,
  keepBasenames: ReadonlySet<string>,
): Promise<string[]> {
  const removed: string[] = []
  try {
    const dirAbs = absPath(guideDirRel)
    let entries: string[]
    try {
      entries = await readdir(dirAbs)
    } catch {
      return removed // dir missing/unreadable → nothing to sweep.
    }
    // Match `Release notes — v<anything>.md` and its `.conflict-<ms>.md` siblings.
    const RELEASE_NOTES_FILE_RE = /^Release notes — v.+?\.md$/
    for (const name of entries) {
      if (!RELEASE_NOTES_FILE_RE.test(name)) continue
      if (keepBasenames.has(name)) continue
      try {
        await rm(join(dirAbs, name), { force: true })
        removed.push(`${guideDirRel}/${name}`)
      } catch {
        // best-effort — a failed unlink must not abort the sweep or throw.
      }
    }
  } catch {
    // best-effort — never propagate.
  }
  return removed
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
