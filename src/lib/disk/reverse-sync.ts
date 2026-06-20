// F2: reverse sync — an external edit to a mirrored .md flows back into its doc.
// Server-only (node:fs + db). No 'server-only' guard so it stays
// integration-testable; never import into a client component.
//
// Best-effort throughout: a malformed file, a missing doc, or a parse error
// must NOT throw or crash the watcher / server. Every path returns a
// ChangeClass; on any error it returns 'echo' (the do-nothing class).

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { eq } from 'drizzle-orm'
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
      const json = markdownToJson(content)
      await db
        .update(schema.documents)
        .set({
          content: json,
          markdown: content,
          diskSyncedHash: fileHash,
          updatedAt: new Date(),
        })
        .where(eq(schema.documents.id, doc.id))
      return 'apply'
    }

    // conflict → do NOT clobber the doc. Write the external content to a sibling
    // `<name>.conflict-<unixms>.md` and leave the doc untouched. Best-effort.
    const dir = dirname(absFilePath)
    const base = absFilePath.slice(dir.length + 1)
    const stem = base.endsWith('.md') ? base.slice(0, -3) : base
    const conflictPath = join(dir, `${stem}.conflict-${Date.now()}.md`)
    try {
      await writeFile(conflictPath, content, 'utf8')
    } catch {
      // best-effort — a failed conflict write must not throw.
    }
    console.warn(`[parchment-disk] conflict on ${relPath}`)
    return 'conflict'
  } catch {
    // Any unexpected error is best-effort — never propagate.
    return 'echo'
  }
}
