// F2: reverse sync — an external edit to a mirrored .md flows back into its doc.
// Server-only (node:fs + db). No 'server-only' guard so it stays
// integration-testable; never import into a client component.
//
// Best-effort throughout: a malformed file, a missing doc, or a parse error
// must NOT throw or crash the watcher / server. Every path returns a
// ChangeClass; on any error it returns 'echo' (the do-nothing class).

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/db'
import { markdownToJson } from '@/lib/markdown/parse'
import { sha256 } from './hash'
import { type ChangeClass, classifyChange } from './sync-decision'

/** Read the files root at call time so tests can override PARCHMENT_FILES_ROOT. */
function filesRoot(): string {
  return process.env.PARCHMENT_FILES_ROOT ?? `${process.env.HOME ?? '/data'}/parchment/files`
}

/**
 * Should this path be ignored outright (not under root, not a managed .md,
 * a dotfile/dot-dir, an `.assets` sibling, or a generated `*.conflict-*.md`)?
 * Returns the POSIX-style relPath under root when it IS a candidate, else null.
 */
function relPathIfManaged(absFilePath: string): string | null {
  if (!isAbsolute(absFilePath)) return null
  const root = filesRoot()
  const rel = relative(root, absFilePath)
  // Outside the root → relative() yields a path starting with '..' or absolute.
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null

  const segments = rel.split(sep)
  // Reject dotfiles/dot-dirs and `.assets` anywhere in the chain.
  if (segments.some((s) => s.startsWith('.') || s === '.assets' || s.endsWith('.assets'))) {
    return null
  }
  const base = segments[segments.length - 1] ?? ''
  if (!base.endsWith('.md')) return null
  // Skip our own conflict siblings: `<name>.conflict-<unixms>.md`.
  if (/\.conflict-\d+\.md$/.test(base)) return null

  // disk_path is stored POSIX-style ('/'); normalize for the DB lookup.
  return segments.join('/')
}

/**
 * Does a conflict sibling for `<stem>` already exist in `dir` whose content
 * hashes to `fileHash`? Used to avoid re-emitting an identical conflict file on
 * every watcher event for the same unresolved divergence. Best-effort: any fs
 * error is swallowed and treated as "not found" (we'd rather risk one extra
 * sibling than throw out of the watcher).
 */
async function conflictSiblingExists(
  dir: string,
  stem: string,
  fileHash: string,
): Promise<boolean> {
  try {
    const entries = await readdir(dir)
    const re = new RegExp(`^${escapeRegExp(stem)}\\.conflict-\\d+\\.md$`)
    for (const name of entries) {
      if (!re.test(name)) continue
      try {
        const existing = await readFile(join(dir, name), 'utf8')
        if (sha256(existing) === fileHash) return true
      } catch {
        // unreadable sibling — ignore it and keep scanning.
      }
    }
  } catch {
    // dir unreadable — treat as "no sibling".
  }
  return false
}

/** Escape a string for safe inclusion in a RegExp (stem may contain metachars). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Handle an external change to an absolute `.md` path: resolve the doc by its
 * `disk_path`, read the file, classify the change, and apply / ignore /
 * conflict per the F2 rules. Best-effort, NEVER throws. Returns the
 * ChangeClass acted on (or 'echo' for ignored / unresolved paths).
 */
export async function handleExternalChange(absFilePath: string): Promise<ChangeClass> {
  try {
    const relPath = relPathIfManaged(absFilePath)
    if (relPath === null) return 'echo'

    // Owner-agnostic resolution by path; disk_path is unique enough across owners
    // because the mirror disambiguates collisions.
    const [doc] = await db
      .select({
        id: schema.documents.id,
        markdown: schema.documents.markdown,
        diskSyncedHash: schema.documents.diskSyncedHash,
      })
      .from(schema.documents)
      .where(eq(schema.documents.diskPath, relPath))
      .limit(1)

    // Unmanaged file → no matching doc. New-file import is out of scope for F2
    // (noted as a gap); do NOT create a doc.
    if (!doc) return 'echo'

    const content = await readFile(absFilePath, 'utf8')
    const fileHash = sha256(content)
    const dbHash = sha256(doc.markdown ?? '')
    const cls = classifyChange(fileHash, dbHash, doc.diskSyncedHash)

    if (cls === 'echo') return 'echo'

    if (cls === 'apply') {
      // Parse md → ProseMirror JSON and update the row DIRECTLY (not via
      // saveDocument) so we don't re-trigger the mirror. We set
      // disk_synced_hash = fileHash so the eventual mirror write (if any) is an
      // echo — this is what makes the loop provably terminate.
      //
      // CRITICAL (TOCTOU): the classification above was made on a snapshot read
      // outside any lock. An in-app autosave (saveDocument → syncDocToDisk) could
      // commit between that read and this write, changing markdown +
      // disk_synced_hash. A blind UPDATE keyed only on `id` would silently clobber
      // that just-saved in-app edit with the external file's content (permanent
      // data loss). Guard the UPDATE with an optimistic compare-and-swap on the
      // baseline we classified against: it only applies while disk_synced_hash is
      // still what we read. A concurrent write moves the baseline, rowCount === 0,
      // and we re-handle from scratch (re-read + re-classify) so the now-current
      // state decides echo / apply / conflict — never an unconditional overwrite.
      const json = markdownToJson(content)
      const baselineGuard =
        doc.diskSyncedHash == null
          ? isNull(schema.documents.diskSyncedHash)
          : eq(schema.documents.diskSyncedHash, doc.diskSyncedHash)
      const result = await db
        .update(schema.documents)
        .set({
          content: json,
          markdown: content,
          diskSyncedHash: fileHash,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.documents.id, doc.id), baselineGuard))

      if ((result.rowCount ?? 0) === 0) {
        // A concurrent write advanced the baseline between our read and this
        // write. Our classification is stale — re-handle against the new state
        // (bounded recursion: each retry only happens on an interleaving write,
        // and best-effort try/catch guarantees we never throw).
        return handleExternalChange(absFilePath)
      }
      return 'apply'
    }

    // conflict → do NOT clobber the doc. Write the external content to a sibling
    // `<name>.conflict-<unixms>.md` and leave the doc untouched. Best-effort.
    const dir = dirname(absFilePath)
    const stem = basename(absFilePath).replace(/\.md$/, '')

    // De-duplicate conflict siblings: an UNRESOLVED conflict re-fires a watcher
    // event on every later touch of the still-divergent file (and the
    // disk_synced_hash baseline does not advance on conflict), so without this
    // guard a single divergence would spawn a fresh <name>.conflict-<ms>.md on
    // EVERY event — unbounded conflict-file spam. Skip the write when a conflict
    // sibling for this base already holds exactly this external content.
    const alreadyEmitted = await conflictSiblingExists(dir, stem, fileHash)
    if (!alreadyEmitted) {
      const conflictPath = join(dir, `${stem}.conflict-${Date.now()}.md`)
      try {
        await writeFile(conflictPath, content, 'utf8')
      } catch {
        // best-effort — a failed conflict write must not throw.
      }
    }
    console.warn(`[parchment-disk] conflict on ${relPath}`)
    return 'conflict'
  } catch {
    // Any unexpected error is best-effort — never propagate.
    return 'echo'
  }
}
