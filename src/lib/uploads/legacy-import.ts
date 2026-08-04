// v0.2.15: one-shot import of pre-v0.2.12 disk-only assets into the database.
//
// Before v0.2.12 an asset existed ONLY on disk at `.assets/<docId>/<uuid>.<ext>`,
// invisible to Postgres. `pgbackweb` backs up the database, so a restore returned
// documents with broken images. v0.2.12 made the `assets` table the source of
// truth for anything uploaded SINCE; this brings the stragglers across.
//
// DELIBERATELY NOT AUTOMATIC. This reads bytes from disk and writes them into the
// database, which is the exact opposite of the standing one-directional
// DB -> disk rule for asset bytes. Doing it inside syncDocToDisk would make that
// reversal an ongoing behaviour of the running system and give assets the same
// two-writers problem that documents have. It is a migration, so it runs once,
// on purpose, from a script.
//
// Idempotent: a file whose (doc_id, filename) already has a row is skipped, so a
// second run is a no-op and an interrupted run can simply be re-run.

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { isS3Configured } from '@/lib/backup/s3'
import { ASSETS_DIRNAME, isUuidName } from './asset-path'
import { upsertAsset } from './assets-repo'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Extension -> mime. Only the types ALLOWED_UPLOAD_TYPES admits are mapped. */
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}

export function mimeForName(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

export type LegacyAsset = {
  docId: string
  filename: string
  absPath: string
  byteSize: number
}

/**
 * Find every legacy asset under `<root>/.assets/<docId>/`. Ignores anything that
 * is not a uuid-shaped directory holding minted `<uuid>.<ext>` filenames, so a
 * stray file in that tree can never be turned into a row. Never throws; an
 * unreadable tree yields an empty list.
 */
export async function scanLegacyAssets(root: string): Promise<LegacyAsset[]> {
  const out: LegacyAsset[] = []
  const base = join(root, ASSETS_DIRNAME)
  let docDirs: string[]
  try {
    docDirs = await readdir(base)
  } catch {
    return out // no legacy tree at all - the expected state post-migration.
  }
  for (const docId of docDirs) {
    if (!UUID.test(docId)) continue
    const dir = join(base, docId)
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      continue
    }
    for (const filename of names) {
      if (!isUuidName(filename)) continue
      const absPath = join(dir, filename)
      try {
        const st = await stat(absPath)
        if (!st.isFile()) continue
        out.push({ docId, filename, absPath, byteSize: st.size })
      } catch {
        // unreadable entry - skip it rather than abort the scan.
      }
    }
  }
  return out
}

export type ImportResult = {
  found: number
  imported: number
  skippedExisting: number
  skippedOrphan: number
  failed: number
  dryRun: boolean
}

/**
 * Import every legacy asset that has no row yet. `dryRun` (the default) reports
 * what WOULD happen and writes nothing.
 *
 * An asset whose document no longer exists is counted as an orphan and skipped:
 * `assets.doc_id` is a foreign key with ON DELETE CASCADE, so inserting one would
 * fail anyway, and its document is gone regardless.
 */
export async function importLegacyAssets(opts: {
  root: string
  dryRun?: boolean
}): Promise<ImportResult> {
  const dryRun = opts.dryRun !== false
  const found = await scanLegacyAssets(opts.root)
  const res: ImportResult = {
    found: found.length,
    imported: 0,
    skippedExisting: 0,
    skippedOrphan: 0,
    failed: 0,
    dryRun,
  }
  const storeInDb = !isS3Configured()

  for (const asset of found) {
    try {
      const [existing] = await db
        .select({ id: schema.assets.id })
        .from(schema.assets)
        .where(
          and(eq(schema.assets.docId, asset.docId), eq(schema.assets.filename, asset.filename)),
        )
        .limit(1)
      if (existing) {
        res.skippedExisting++
        continue
      }

      const [doc] = await db
        .select({ id: schema.documents.id })
        .from(schema.documents)
        .where(eq(schema.documents.id, asset.docId))
        .limit(1)
      if (!doc) {
        res.skippedOrphan++
        continue
      }

      if (dryRun) {
        res.imported++
        continue
      }

      const bytes = new Uint8Array(await readFile(asset.absPath))
      await upsertAsset({
        docId: asset.docId,
        filename: asset.filename,
        mime: mimeForName(asset.filename),
        bytes,
        storeInDb,
      })
      res.imported++
    } catch {
      res.failed++
    }
  }
  return res
}
