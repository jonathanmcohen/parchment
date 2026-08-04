// v0.2.15: the mirror half of DB-backed assets.
//
// v0.2.12 made the `assets` table the source of truth for bytes. This writes the
// one-directional DB -> disk copy: each asset lands beside its document as
// `<DocName>.assets/<uuid>.<ext>`, and the markdown written to disk points at
// that relative path instead of the `/api/docs/<id>/assets/...` route. The result
// is a directory a human (or Obsidian) can open with the images intact.
//
// TWO DIRECTIONS, AND ONLY ONE OF THEM MOVES BYTES.
//
//   bytes     DB -> disk ONLY. Nothing here reads an image off disk and nothing
//             writes back into the `assets` table. `relPathIfManaged()` rejects
//             any path containing a `*.assets` segment, pinned by tests, so the
//             watcher can never mistake an image for an edited document.
//
//   URLs      both ways, because it has to be. documents.markdown stores the
//             `/api/...` form (what the browser needs); the disk copy stores the
//             relative form (what a file browser needs). If reverse-sync parsed
//             the relative form straight back into the DB, every image in the
//             document would break in the app. So an inbound external edit is
//             normalised back to the `/api/...` form before it is applied.
//
// The hash baseline follows the same rule: `disk_synced_hash` is the hash of the
// DISK form. Hashing the DB form against a disk file that legitimately differs
// would make every mirrored document look externally modified forever.
//
// Pure functions only in the top half - no fs, no db - so the rewriting is
// unit-testable without a container. The fs/db half lives below.

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getAssetBytes, listAssets } from '@/lib/uploads/assets-repo'

/** A stored asset name: uuid + extension. Mirrors asset-path.ts's SAFE_ASSET_NAME. */
const SAFE_ASSET_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The assets directory that sits beside a document's `.md`.
 * `Work/Q1/My Notes.md` -> `Work/Q1/My Notes.assets`
 *
 * Derived from the doc's disk path rather than its title, so it always tracks the
 * disambiguated filename the mirror actually wrote (`My Notes (2).md` gets
 * `My Notes (2).assets`, not a second `My Notes.assets`).
 */
export function assetsDirRelPath(docRelPath: string): string {
  const base = docRelPath.endsWith('.md') ? docRelPath.slice(0, -3) : docRelPath
  return `${base}.assets`
}

/** Just the directory's own name, without any parent folders. */
export function assetsDirName(docRelPath: string): string {
  const rel = assetsDirRelPath(docRelPath)
  const idx = rel.lastIndexOf('/')
  return idx === -1 ? rel : rel.slice(idx + 1)
}

/**
 * Percent-encode the directory name for use in a markdown link. Titles routinely
 * contain spaces, and `![](My Doc.assets/x.png)` does not parse - the space ends
 * the URL. encodeURIComponent leaves `.` and `-` alone and is stable to decode.
 */
function encodeDirName(name: string): string {
  return encodeURIComponent(name)
}

/**
 * DB form -> disk form. Rewrites `/api/docs/<docId>/assets/<name>` into
 * `<DocName>.assets/<name>` throughout the markdown.
 *
 * Deliberately operates on the URL substring rather than on markdown image
 * syntax, so it covers `![](...)`, `[](...)`, and raw `<img src="...">` alike
 * without needing to parse markdown.
 */
export function toDiskMarkdown(markdown: string, docId: string, docRelPath: string): string {
  if (!markdown) return markdown
  const dir = encodeDirName(assetsDirName(docRelPath))
  const re = new RegExp(`/api/docs/${escapeRegExp(docId)}/assets/([^\\s)"'<>]+)`, 'g')
  return markdown.replace(re, (_m, name: string) => `${dir}/${name}`)
}

/**
 * Disk form -> DB form. The inverse of toDiskMarkdown, applied to content read
 * back off disk before it reaches the database.
 *
 * Accepts the encoded AND the raw directory name: a human editing the file in
 * Obsidian may well leave `My Doc.assets/x.png` unencoded, and that must still
 * resolve rather than being stored as a broken relative link.
 *
 * Only rewrites names that look like minted asset filenames, so an unrelated
 * relative link that happens to sit in a similarly named folder is left alone.
 */
export function toDbMarkdown(markdown: string, docId: string, docRelPath: string): string {
  if (!markdown) return markdown
  const raw = assetsDirName(docRelPath)
  const encoded = encodeDirName(raw)
  const alternatives = raw === encoded ? [raw] : [encoded, raw]
  let out = markdown
  for (const dir of alternatives) {
    const re = new RegExp(`${escapeRegExp(dir)}/([^\\s)"'<>]+)`, 'g')
    out = out.replace(re, (whole, name: string) =>
      SAFE_ASSET_NAME.test(name) ? `/api/docs/${docId}/assets/${name}` : whole,
    )
  }
  return out
}

// -- fs + db half -------------------------------------------------------------

/** Read the files root at call time so tests can override PARCHMENT_FILES_ROOT. */
function filesRoot(): string {
  return process.env.PARCHMENT_FILES_ROOT ?? `${process.env.HOME ?? '/data'}/parchment/files`
}

/**
 * Write every asset the database holds for `docId` into `<DocName>.assets/`, and
 * delete any file in that directory the database no longer knows about. The
 * database is the authority in both directions of that reconciliation.
 *
 * S3-backed deployments have `bytes` null; those rows are skipped rather than
 * written as empty files.
 *
 * Best-effort, mirroring the rest of this module: a mirror failure must never
 * break a document save. Returns the number of files written.
 */
export async function syncAssetsToDisk(docId: string, docRelPath: string): Promise<number> {
  let written = 0
  try {
    const rows = await listAssets(docId)
    const dirRel = assetsDirRelPath(docRelPath)
    const dirAbs = join(filesRoot(), dirRel)

    if (rows.length === 0) {
      // No assets left: remove the directory entirely rather than leaving an
      // empty one beside every document that ever had an image.
      await removeAssetsDir(docRelPath)
      return 0
    }

    await mkdir(dirAbs, { recursive: true })

    const expected = new Set<string>()
    for (const row of rows) {
      // Defensive: only ever write a minted asset name. A row with an unexpected
      // filename must not become a path this code writes to.
      if (!SAFE_ASSET_NAME.test(row.filename)) continue
      expected.add(row.filename)
      const bytes = await getAssetBytes(docId, row.filename)
      if (!bytes) continue // S3-backed, or a row without bytes.
      try {
        await writeFile(join(dirAbs, row.filename), Buffer.from(bytes))
        written++
      } catch {
        // best-effort per file - one unwritable asset must not abort the rest.
      }
    }

    // Prune files the database no longer lists (asset deleted, or replaced).
    try {
      for (const name of await readdir(dirAbs)) {
        if (expected.has(name)) continue
        await rm(join(dirAbs, name), { force: true }).catch(() => {})
      }
    } catch {
      // dir unreadable - nothing to prune.
    }
  } catch {
    // best-effort - never propagate out of a document save.
  }
  return written
}

/**
 * Remove a document's assets directory. Called when the doc is deleted, when it
 * moves (the new location gets a fresh directory), and when its last asset goes.
 * Best-effort; never throws.
 */
export async function removeAssetsDir(docRelPath: string): Promise<void> {
  try {
    const dirAbs = join(filesRoot(), assetsDirRelPath(docRelPath))
    // rm -rf is the honest operation here, but scope it: only ever a path this
    // module built, which always ends in `.assets`.
    if (!dirAbs.endsWith('.assets')) return
    await rm(dirAbs, { recursive: true, force: true })
    // Ancestor pruning is deliberately NOT done here. mirror.ts already prunes
    // empty parents after a move, and reaching upward from this module would let
    // an assets cleanup delete an empty user FOLDER as a side effect.
  } catch {
    // best-effort.
  }
}
