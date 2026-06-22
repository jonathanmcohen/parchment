import 'server-only'

// I4 — Workspace backup service (server; touches @/db).
//
// Composes the pure archive module with the doc repo: it reads every doc the
// owner has and builds a lossless backup zip, and on restore it re-creates docs
// from a backup zip with per-doc resilience (one failure → skipped + warning,
// never aborts the whole restore).

import {
  type BackupDocInput,
  buildWorkspaceBackup,
  parseWorkspaceBackup,
} from '@/lib/backup/archive'
import { listFolders } from '@/lib/docs/folders-repo'
import { createDocument, getDocument, listDocuments } from '@/lib/docs/repo'

export interface RestoreResult {
  created: number
  skipped: number
  warnings: string[]
}

/**
 * Build a lossless backup zip of every (non-trashed) doc owned by `ownerId`.
 * `createdAt` is injected by the caller (route passes new Date().toISOString()).
 */
export async function createWorkspaceBackup(
  ownerId: string,
  createdAt: string,
): Promise<Uint8Array> {
  const summaries = await listDocuments(ownerId)
  const docs: BackupDocInput[] = []
  for (const summary of summaries) {
    const full = await getDocument(summary.id)
    // Defensive: skip a row that vanished or isn't owned by this user.
    if (!full || full.ownerId !== ownerId) continue
    docs.push({
      id: full.id,
      title: full.title,
      folderId: full.folderId,
      content: full.content,
    })
  }
  return buildWorkspaceBackup(docs, createdAt)
}

/**
 * Restore docs from a backup zip into `ownerId`'s workspace.
 *
 * - parseWorkspaceBackup applies the H9 guards and carries forward its warnings.
 * - Each doc is created in its own try/catch: one failure increments `skipped`
 *   and pushes a warning but never aborts the restore.
 * - folderId SAFETY: a backed-up folderId is only honored when that folder
 *   currently exists for THIS owner; otherwise it is dropped to null so a doc is
 *   never planted into a foreign / non-existent folder.
 *
 * Throws only for a fundamentally invalid backup (not a zip / no manifest) — the
 * surface that parseWorkspaceBackup throws on. Per-doc problems never throw.
 */
export async function restoreWorkspaceBackup(
  ownerId: string,
  bytes: Uint8Array,
): Promise<RestoreResult> {
  const { entries, warnings } = await parseWorkspaceBackup(bytes)

  // The owner's existing folder ids — the allow-list for restored folderIds.
  const folders = await listFolders(ownerId)
  const ownFolderIds = new Set(folders.map((f) => f.id))

  let created = 0
  let skipped = 0

  for (const entry of entries) {
    try {
      const folderId =
        entry.meta.folderId !== null && ownFolderIds.has(entry.meta.folderId)
          ? entry.meta.folderId
          : undefined
      await createDocument(ownerId, {
        title: entry.meta.title,
        ...(folderId ? { folderId } : {}),
        content: entry.content,
      })
      created++
    } catch (err) {
      skipped++
      warnings.push(
        `Failed to restore doc "${entry.meta.title}" (${entry.meta.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  return { created, skipped, warnings }
}
