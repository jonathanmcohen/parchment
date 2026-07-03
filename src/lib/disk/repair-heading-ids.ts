// v0.2.10 — one-shot disk-repair sweep for legacy heading-id snowball pollution.
//
// BACKGROUND. Until v0.2.9, heading-id sentinel comments snowballed in mirrored
// markdown: parse stripped only ONE trailing `<!-- id:x -->`, leftovers polluted the
// heading text, slugs were re-derived from the polluted text, so each disk↔DB round
// trip added a layer — observed in prod four layers deep:
//   # Release notes <!-- id:release-notes --> <!-- id:release-notes-idrelease-notes -->
//                   <!-- id:release-notes-idrelease-notes-idrelease-notes-idrelease-notes -->
// v0.2.9 fixed parse.ts (strips ALL id comments, takes the first) and serialize.ts
// (idempotent), so a polluted doc self-heals ON ITS NEXT SYNC. But a doc that never
// syncs again stays polluted on disk forever, and its DB heading TEXT may still carry
// the literal comment garbage from an import done under the OLD code.
//
// THIS MODULE proactively heals everything ONCE, at boot:
//   (a) DB heal — a SURGICAL tree transform strips `<!-- id:… -->` residue from
//       heading TEXT NODES only (all other nodes, marks, and attrs are preserved
//       byte-for-byte), then documents.markdown is re-projected through the FIXED
//       serializer. Only written when something actually changed.
//   (b) Disk heal — the mirrored .md at the doc's EXISTING disk_path is rewritten to
//       that canonical projection, only when the file bytes differ AND the file holds
//       no un-imported external edit (quiescence guard, below).
//
// WHY SURGICAL, NOT A FULL-DOC ROUND TRIP. `parse(serialize(content))` would also
// "clean" the residue, but parse.ts has documented fidelity gaps — footnoteRef
// degrades to escaped literal text, equationRef to plain `(N)`, wikiLink targetIds
// drop — so replacing content with a full round trip would DAMAGE healthy docs that
// merely drifted from the current serializer's output. The surgical transform touches
// nothing but the polluted heading text, so non-heading content can never be lossy.
// The transform's residue pattern deliberately mirrors parse.ts's HEADING_ID_GLOBAL_RE
// and its trailing-whitespace tidy (v0.2.9 #2); a cross-check unit test pins the two
// together so they cannot silently drift. Serialization is CONSUMED as-is — the
// canonical markdown is exactly `serializeMarkdown(cleanedContent)`.
//
// WATCHER SAFETY (no echo loops). Before writing a file we advance
// documents.disk_synced_hash to the hash of the bytes about to land — the exact
// suppression ordering syncDocToDisk (mirror.ts) uses — so the reverse-sync watcher
// classifies our own write as an 'echo' and never re-imports it. Additionally, a doc
// whose file differs from BOTH the sync baseline and the stored markdown holds a
// PENDING EXTERNAL EDIT: the sweep skips it entirely (DB and disk) — reverse-sync owns
// that file, and the v0.2.9 parse self-heals the pollution on that import anyway.
//
// CONSTRAINT: this runs in the Next.js *server* runtime (boot maintenance), so it
// must NOT import the Tiptap editor extension graph / @tiptap/html / any DOM — same
// justification as parse.ts. serializeMarkdown is graph-free. No 'server-only' guard
// so it stays unit/integration-testable; imported only by server code (the (app)
// layout boot hook).

import { readFile, writeFile } from 'node:fs/promises'
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getSetting, setSetting } from '@/lib/docs/settings-repo'
import { serializeMarkdown } from '@/lib/markdown/serialize'
import { sha256 } from './hash'
import { absPath } from './mirror'

/** Settings key: repair-version marker. Value '1' = this instance's docs are repaired. */
export const DISK_REPAIR_HEADING_IDS_KEY = 'diskRepairHeadingIds'
/** The current repair version. Bumping it would re-run the sweep for a future fix. */
export const DISK_REPAIR_HEADING_IDS_VERSION = '1'

/**
 * Heading-id sentinel residue, anywhere in a string. MIRRORS parse.ts's
 * HEADING_ID_GLOBAL_RE exactly (same shape, whitespace-tolerant) — parse.ts owns the
 * md-token-level strip; this is the PM-JSON-level twin for text nodes the OLD import
 * code baked the literal comments into. A unit test cross-checks this against
 * markdownToJson so the two patterns cannot silently drift. Always used with a fresh
 * lastIndex (either .replace, or reset before .exec loops).
 */
const HEADING_ID_RESIDUE_RE = /<!--\s*id:([\w-]+)\s*-->/g

type PMNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: unknown[]
}

/**
 * v0.2.9 #2's trailing-whitespace tidy, applied to a heading's inline children after
 * residue removal: the space that preceded a ` <!-- id:… -->` survives the strip and
 * would re-serialize as `# Title ` (trailing space, breaking byte-idempotency). Trim
 * the trailing edge of the LAST text node(s); drop nodes that become empty (PM forbids
 * empty text nodes). ONLY the trailing edge — interior spacing is preserved, exactly
 * as parse.ts's trimTrailingWhitespaceTextNodes behaves.
 */
function trimTrailingWhitespace(nodes: PMNode[]): PMNode[] {
  const out = [...nodes]
  while (out.length > 0) {
    const last = out[out.length - 1]
    if (last?.type !== 'text' || typeof last.text !== 'string') break
    const trimmed = last.text.replace(/\s+$/, '')
    if (trimmed === last.text) break
    if (trimmed.length === 0) {
      out.pop()
      continue
    }
    out[out.length - 1] = { ...last, text: trimmed }
    break
  }
  return out
}

/** Clean one heading node. Returns the original object when nothing changed. */
function cleanHeadingNode(node: PMNode): { node: PMNode; changed: boolean } {
  const children = node.content ?? []
  // Fast path: no text child carries residue → untouched (object identity kept).
  const polluted = children.some(
    (c) => c.type === 'text' && typeof c.text === 'string' && HEADING_ID_RESIDUE_RE.test(c.text),
  )
  HEADING_ID_RESIDUE_RE.lastIndex = 0 // shared /g regex — always reset after .test
  if (!polluted) return { node, changed: false }

  // The FIRST id found (document order) is the canonical slug — same rule parse.ts
  // applies to md tokens. Only used when the heading has no non-empty attrs.id (an
  // existing id attr was set by the editor's HeadingId and stays authoritative).
  let firstId = ''
  const rebuilt: PMNode[] = []
  for (const c of children) {
    if (c.type === 'text' && typeof c.text === 'string') {
      if (!firstId) {
        HEADING_ID_RESIDUE_RE.lastIndex = 0
        const m = HEADING_ID_RESIDUE_RE.exec(c.text)
        if (m) firstId = m[1] ?? ''
      }
      const stripped = c.text.replace(HEADING_ID_RESIDUE_RE, '')
      if (stripped.length === 0) continue // node became empty → drop (PM invariant)
      rebuilt.push(stripped === c.text ? c : { ...c, text: stripped })
    } else {
      rebuilt.push(c) // non-text inline (math, wiki, …) — never touched
    }
  }
  const content = trimTrailingWhitespace(rebuilt)

  const existingId = typeof node.attrs?.id === 'string' ? node.attrs.id : ''
  const next: PMNode = { ...node }
  if (existingId.length === 0 && firstId.length > 0) {
    next.attrs = { ...(node.attrs ?? {}), id: firstId }
  }
  if (content.length > 0) {
    next.content = content
  } else {
    // A heading whose entire text was residue ends up content-less: drop the key
    // entirely (PM forbids empty text nodes; serialize treats missing content as '').
    delete next.content
  }
  return { node: next, changed: true }
}

/**
 * SURGICAL residue clean over a ProseMirror JSON tree: strips `<!-- id:… -->`
 * remnants from HEADING text nodes only (recursing through containers so headings
 * inside blockquotes/lists are covered). Everything else — other node types, marks,
 * unknown heading attrs, non-heading text that happens to contain a comment-like
 * string — is preserved with object identity where unchanged. Pure; NEVER throws on
 * malformed input (a non-object degrades to changed:false).
 */
export function cleanHeadingIdResidue(contentJson: unknown): {
  cleaned: unknown
  changed: boolean
} {
  if (contentJson === null || typeof contentJson !== 'object' || Array.isArray(contentJson)) {
    return { cleaned: contentJson, changed: false }
  }
  let changed = false

  function walk(node: PMNode): PMNode {
    if (node.type === 'heading') {
      const r = cleanHeadingNode(node)
      if (r.changed) changed = true
      return r.node
    }
    if (Array.isArray(node.content) && node.content.length > 0) {
      let any = false
      const next = node.content.map((child) => {
        const w = walk(child)
        if (w !== child) any = true
        return w
      })
      return any ? { ...node, content: next } : node
    }
    return node
  }

  try {
    const cleaned = walk(contentJson as PMNode)
    return { cleaned, changed }
  } catch {
    // Defensive: a hostile/cyclic tree must never break the sweep — treat as clean.
    return { cleaned: contentJson, changed: false }
  }
}

/** Per-document repair outcome, aggregated into the sweep summary. */
export type DocRepairResult = {
  /** the DB row was rewritten (residue-cleaned content and/or normalized markdown). */
  dbCleaned: boolean
  /** the disk-mirror .md file was rewritten to canonical bytes. */
  fileRewritten: boolean
  /** the doc threw during repair (isolated — never blocks the rest of the sweep). */
  errored: boolean
}

type DocRow = {
  id: string
  content: unknown
  markdown: string | null
  diskPath: string | null
  diskSyncedHash: string | null
}

/**
 * Repair a single document (best-effort, NEVER throws):
 *
 *   1. Surgically clean heading-id residue out of the content tree, and project the
 *      canonical markdown via the FIXED serializer.
 *   2. QUIESCENCE GUARD — if the doc has a mirrored file whose bytes differ from BOTH
 *      the sync baseline (disk_synced_hash) and the stored markdown, the file holds an
 *      un-imported external edit: skip the doc ENTIRELY. Overwriting would lose the
 *      user's edit, and even a DB-only heal would flip that pending 'apply' into a
 *      spurious 'conflict' (classifyChange compares against the stored markdown).
 *      Reverse-sync will import the file and the v0.2.9 parse self-heals it there.
 *   3. DB heal — when the cleaned content or the canonical markdown differs from what
 *      is stored, rewrite the row. When a quiescent file exists the same UPDATE also
 *      advances disk_synced_hash to the canonical hash (echo-suppression baseline).
 *   4. Disk heal — when the quiescent file's bytes differ from the canonical
 *      markdown, rewrite it IN PLACE (existing disk_path; no move/re-disambiguation),
 *      with the baseline advanced BEFORE the write — the exact syncDocToDisk ordering
 *      — so the watcher classifies our write as an 'echo'.
 *
 * A clean doc produces ZERO writes (mtime preserved). Idempotent by construction: the
 * canonical form is a fixpoint. Any thrown error is caught → `errored: true`.
 */
export async function repairDocument(doc: DocRow): Promise<DocRepairResult> {
  const result: DocRepairResult = { dbCleaned: false, fileRewritten: false, errored: false }
  try {
    // No content JSON → nothing safely healable (canonical markdown can't be derived;
    // blanking the projection from a null tree would be destructive, not a repair).
    if (doc.content === null || doc.content === undefined || typeof doc.content !== 'object') {
      return result
    }
    const storedMarkdown = doc.markdown ?? ''
    const { cleaned, changed } = cleanHeadingIdResidue(doc.content)
    const canonical = serializeMarkdown(cleaned)
    const canonicalHash = sha256(canonical)
    const needDb = changed || canonical !== storedMarkdown

    // Read the mirrored file BEFORE any DB write so quiescence is judged against the
    // pre-sweep baseline.
    let fileBytes: string | null = null
    if (doc.diskPath) {
      try {
        fileBytes = await readFile(absPath(doc.diskPath), 'utf8')
      } catch {
        // Missing/unreadable file — the sweep repairs existing mirrors, it is not a
        // mirror-materializer. Fall through to a DB-only heal; a later normal save
        // re-mirrors the file through syncDocToDisk.
        fileBytes = null
      }
    }

    if (fileBytes !== null) {
      const fileHash = sha256(fileBytes)
      const quiescent = fileHash === doc.diskSyncedHash || fileBytes === storedMarkdown
      if (!quiescent) return result // pending external edit — leave doc + file alone.

      const needFile = fileBytes !== canonical
      if (needDb || needFile) {
        // One row UPDATE: cleaned content only when the tree actually changed; the
        // canonical markdown; and the advanced baseline — set BEFORE the file write
        // (echo suppression, mirror.ts ordering).
        await db
          .update(schema.documents)
          .set({
            ...(changed ? { content: cleaned as never } : {}),
            markdown: canonical,
            diskSyncedHash: canonicalHash,
          })
          .where(eq(schema.documents.id, doc.id))
        result.dbCleaned = needDb
      }
      if (needFile) {
        await writeFile(absPath(doc.diskPath as string), canonical, 'utf8')
        result.fileRewritten = true
      }
    } else if (needDb) {
      // No mirrored file: DB-only heal. The baseline is left untouched — it describes
      // disk state, and there is no disk state; the next mirror write re-derives it.
      await db
        .update(schema.documents)
        .set({
          ...(changed ? { content: cleaned as never } : {}),
          markdown: canonical,
        })
        .where(eq(schema.documents.id, doc.id))
      result.dbCleaned = true
    }
  } catch {
    // Per-document isolation: one corrupt doc must never block boot or the sweep.
    result.errored = true
  }
  return result
}

/** Aggregate counters for the one summary log line. */
export type DiskRepairSummary = {
  scanned: number
  dbCleaned: number
  fileRewritten: number
  errors: number
}

/**
 * Repair every document (all owners, trashed included — a trashed doc's file is
 * usually already gone, but its DB content should still be healed so a restore is
 * clean). Best-effort, per-document isolated. Does NOT touch the settings flag — the
 * caller (runDiskRepairSweepOnce) owns gating so the sweep is only marked complete
 * after a FULL pass.
 */
export async function repairAllDocuments(): Promise<DiskRepairSummary> {
  const summary: DiskRepairSummary = { scanned: 0, dbCleaned: 0, fileRewritten: 0, errors: 0 }
  const rows = await db
    .select({
      id: schema.documents.id,
      content: schema.documents.content,
      markdown: schema.documents.markdown,
      diskPath: schema.documents.diskPath,
      diskSyncedHash: schema.documents.diskSyncedHash,
    })
    .from(schema.documents)

  for (const row of rows) {
    summary.scanned += 1
    const r = await repairDocument(row)
    if (r.dbCleaned) summary.dbCleaned += 1
    if (r.fileRewritten) summary.fileRewritten += 1
    if (r.errored) summary.errors += 1
  }
  return summary
}

/**
 * The instance-wide completion flag lives in the per-(owner,key) settings store under
 * the PRIMARY owner (earliest-created `role='owner'` user). There is always at least
 * one owner (users-repo enforces it), and the primary owner is stable across boots, so
 * this is a reliable "once per instance" marker regardless of which owner happens to
 * trigger boot maintenance first. Returns null only pre-setup (no owner yet), in which
 * case the sweep is skipped — there are no docs to repair anyway.
 */
async function primaryOwnerId(): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, 'owner'))
    .orderBy(asc(schema.users.createdAt))
    .limit(1)
  return row?.id ?? null
}

/**
 * BOOT ENTRYPOINT — run the heading-id disk-repair sweep AT MOST ONCE per instance.
 *
 * Gating: a settings marker (DISK_REPAIR_HEADING_IDS_KEY = the repair version) under
 * the primary owner. On every later boot the marker is already set → this returns
 * `{ skipped: true }` after a single cheap settings read, doing no scan. Bumping
 * DISK_REPAIR_HEADING_IDS_VERSION would re-arm the sweep for a future repair.
 *
 * Crash-safety: the marker is set ONLY after a FULL pass completes. A mid-run crash
 * leaves it unset, so the next boot re-runs — and because a clean doc produces zero
 * writes, the re-run is idempotent (it only re-touches whatever was still polluted).
 *
 * Best-effort: the whole thing is wrapped so a sweep failure can NEVER crash boot.
 * Emits exactly one summary line:
 *   [disk-repair] scanned N, cleaned X db, rewrote Y files, Z errors
 * (or a one-line skip on the fast path).
 */
export async function runDiskRepairSweepOnce(): Promise<
  { skipped: true } | ({ skipped: false } & DiskRepairSummary)
> {
  try {
    const ownerId = await primaryOwnerId()
    if (ownerId === null) return { skipped: true } // pre-setup: no owner, no docs.

    // Fast path — already repaired at this version. One settings read, then done.
    //
    // The marker is stored in a jsonb settings column. node-postgres parses jsonb
    // and drizzle's jsonb mapFromDriverValue parses it AGAIN, so a numeric-looking
    // JSON string like "1" round-trips back as the NUMBER 1 (a known drizzle+node-pg
    // jsonb quirk; a non-numeric string like "0.2.9" survives as a string). We only
    // care whether the stored marker EQUALS the current repair version, so compare on
    // String(...) — robust whether it comes back as '1' or 1.
    const marker = await getSetting<unknown>(ownerId, DISK_REPAIR_HEADING_IDS_KEY, null)
    if (marker !== null && String(marker) === DISK_REPAIR_HEADING_IDS_VERSION) {
      console.log('[disk-repair] already complete — skipping heading-id sweep')
      return { skipped: true }
    }

    const summary = await repairAllDocuments()

    // Mark complete ONLY after the full pass. If repairAllDocuments threw it never
    // reaches here (caught below) and the marker stays unset → re-run next boot.
    await setSetting(ownerId, DISK_REPAIR_HEADING_IDS_KEY, DISK_REPAIR_HEADING_IDS_VERSION)

    console.log(
      `[disk-repair] scanned ${summary.scanned}, cleaned ${summary.dbCleaned} db, ` +
        `rewrote ${summary.fileRewritten} files, ${summary.errors} errors`,
    )
    return { skipped: false, ...summary }
  } catch (err) {
    // A repair failure must never crash boot — the app still serves. The marker
    // stays unset so a later boot retries (idempotent).
    console.error('[disk-repair] heading-id sweep failed:', err)
    return { skipped: true }
  }
}
