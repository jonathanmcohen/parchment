import { and, desc, eq, ilike, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { removeDocFromDisk, syncDocToDisk } from '@/lib/disk/mirror'
import { extractCairnPageIds } from '@/lib/docs/cairn-links'
import { setCairnLinks } from '@/lib/docs/cairn-links-repo'
import { extractTargetIds } from '@/lib/docs/doc-links'
import { setDocLinks } from '@/lib/docs/doc-links-repo'
import { parseCustomCss } from '@/lib/editor/custom-css'
import type { WatermarkConfig } from '@/lib/editor/watermark'
import { dispatchWebhooks } from '@/lib/integrations/webhook-dispatch'
import { serializeMarkdown } from '@/lib/markdown/serialize'
import { embed, isSemanticEnabled } from '@/lib/search/embeddings'
import { removeAssetsForDoc } from '@/lib/uploads/store'

// B0 document lifecycle. No 'server-only' guard so the repo stays unit-testable;
// it touches `db` (pg) and is only imported by server routes/components in app code.

export type DocSummary = { id: string; title: string; updatedAt: Date; folderId: string | null }
export type Doc = typeof schema.documents.$inferSelect

export async function createDocument(
  ownerId: string,
  opts: { title?: string; folderId?: string; content?: unknown } = {},
): Promise<{ id: string }> {
  // When content is provided (template instantiation, import, restore), re-derive
  // the markdown projection from the PM JSON. documents.markdown is NOT NULL
  // default '' and search_vector is GENERATED from (title || markdown), so a doc
  // created without this would be body-unsearchable and (see syncDocToDisk below)
  // absent from the disk mirror until the user opened + re-saved it. A blank doc
  // (no content) keeps the schema default ''.
  const hasContent = opts.content !== undefined
  // serializeMarkdown reads `.content` off its argument, so only feed it a real
  // PM object; a null/primitive content (a degenerate backup entry) projects to
  // empty markdown rather than throwing.
  const markdown = hasContent
    ? typeof opts.content === 'object' && opts.content !== null
      ? serializeMarkdown(opts.content)
      : ''
    : undefined
  const [row] = await db
    .insert(schema.documents)
    .values({
      ownerId,
      title: opts.title ?? 'Untitled',
      ...(opts.folderId ? { folderId: opts.folderId } : {}),
      // G2: instantiate from a template's ProseMirror JSON when provided.
      ...(hasContent ? { content: opts.content } : {}),
      ...(markdown !== undefined ? { markdown } : {}),
    })
    .returning({ id: schema.documents.id })
  if (!row) throw new Error('createDocument: insert returned no row')

  // Best-effort disk mirror — a doc created with content must land on disk
  // immediately (Parchment's disk-mirror differentiator), exactly as saveDocument
  // does. syncDocToDisk never throws. A blank doc has empty markdown; mirroring it
  // is harmless and keeps creation uniform with every other write path.
  if (hasContent) await syncDocToDisk(row.id)

  return { id: row.id }
}

export async function saveDocument(
  id: string,
  data: { contentJson: unknown; markdown: string; title?: string },
): Promise<void> {
  const [updated] = await db
    .update(schema.documents)
    .set({
      content: data.contentJson,
      markdown: data.markdown,
      ...(data.title ? { title: data.title } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.documents.id, id))
    .returning({ ownerId: schema.documents.ownerId, title: schema.documents.title })

  // J7: fire `document.saved` to the owner's webhooks, NON-BLOCKING. `void` so we
  // never await in the save's critical path; dispatchWebhooks itself never throws,
  // so a bad/slow webhook can never fail or slow the save. Skipped if the update
  // matched no row (e.g. a since-deleted doc).
  if (updated) {
    void dispatchWebhooks(updated.ownerId, 'document.saved', { docId: id, title: updated.title })
  }

  // F6: best-effort wiki-link index — extract this doc's [[wiki]] targets from
  // the PM JSON and replace its doc_links rows. A failure here must NEVER break
  // the save (e.g. a target referencing a since-deleted doc), so it is wrapped.
  try {
    const targetIds = extractTargetIds(data.contentJson)
    await setDocLinks(id, targetIds)
  } catch {
    // ignore — link indexing is best-effort
  }

  // J1: best-effort cairn-link index — extract this doc's [[cairn://page-id]]
  // targets from the PM JSON and replace its cairn_links rows. Separate try so a
  // failure here (or in the wiki index above) never breaks the document save and
  // the two indexes are independent. pageIds are sanitized in extract/set.
  try {
    const pageIds = extractCairnPageIds(data.contentJson)
    await setCairnLinks(id, pageIds)
  } catch {
    // ignore — cairn-link indexing is best-effort
  }

  // Best-effort embedding generation — never blocks or fails the save.
  if (isSemanticEnabled()) {
    const title = data.title ?? ''
    const text = `${title}\n${data.markdown}`
    try {
      const v = await embed(text)
      if (v) {
        await db.update(schema.documents).set({ embedding: v }).where(eq(schema.documents.id, id))
      }
    } catch {
      // ignore — embedding is best-effort
    }
  }

  // Best-effort disk mirror — never blocks or fails the save.
  await syncDocToDisk(id)
}

export async function getDocument(id: string): Promise<Doc | null> {
  const [row] = await db.select().from(schema.documents).where(eq(schema.documents.id, id)).limit(1)
  return row ?? null
}

/** A4: docs shared WITH this user via document_permissions (not owned by them),
 *  newest-first, excludes trashed. Backs the "Shared with me" view. */
export async function listSharedWithMe(userId: string): Promise<DocSummary[]> {
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      folderId: schema.documents.folderId,
    })
    .from(schema.documents)
    .innerJoin(
      schema.documentPermissions,
      eq(schema.documentPermissions.docId, schema.documents.id),
    )
    .where(and(eq(schema.documentPermissions.userId, userId), isNull(schema.documents.trashedAt)))
    .orderBy(desc(schema.documents.updatedAt))
}

/**
 * D4: Does the collab server already hold a persisted Yjs snapshot for this doc?
 * The editor uses this as the authoritative gate for first-open seeding: when a
 * snapshot exists the server is the source of truth and the client must NOT seed
 * from `documents.content` (doing so races the server sync and duplicates
 * content). When it's absent, this is a never-collaborated doc and the client
 * seeds it from the stored ProseMirror JSON.
 */
export async function hasCollabState(docId: string): Promise<boolean> {
  const [row] = await db
    .select({ name: schema.collabState.name })
    .from(schema.collabState)
    .where(eq(schema.collabState.name, docId))
    .limit(1)
  return row !== undefined
}

export async function listDocuments(ownerId: string): Promise<DocSummary[]> {
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      folderId: schema.documents.folderId,
    })
    .from(schema.documents)
    .where(and(eq(schema.documents.ownerId, ownerId), isNull(schema.documents.trashedAt)))
    .orderBy(desc(schema.documents.updatedAt))
}

/**
 * B6: fuzzy (case-insensitive substring) title search for the link-to-doc picker.
 * Empty `q` → returns the most recently updated docs (up to `limit`).
 */
export async function searchDocuments(
  ownerId: string,
  q: string,
  limit = 10,
): Promise<DocSummary[]> {
  const baseWhere = and(eq(schema.documents.ownerId, ownerId), isNull(schema.documents.trashedAt))
  const where =
    q.trim().length === 0
      ? baseWhere
      : and(baseWhere, or(ilike(schema.documents.title, `%${q.trim()}%`)))
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      folderId: schema.documents.folderId,
    })
    .from(schema.documents)
    .where(where)
    .orderBy(desc(schema.documents.updatedAt))
    .limit(limit)
}

/** Docs directly inside `folderId` (null = root), newest-first, excludes trashed. */
export async function listDocumentsInFolder(
  ownerId: string,
  folderId: string | null,
): Promise<DocRow[]> {
  const folderCondition =
    folderId === null ? isNull(schema.documents.folderId) : eq(schema.documents.folderId, folderId)
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
    .where(
      and(
        eq(schema.documents.ownerId, ownerId),
        isNull(schema.documents.trashedAt),
        folderCondition,
      ),
    )
    .orderBy(desc(schema.documents.updatedAt))
}

/** DocRow extends DocSummary with the `starred` flag, creation date, size, and preview. */
export type DocRow = DocSummary & {
  starred: boolean
  createdAt: Date
  size: number
  preview: string
}

/** N most-recently-updated non-trashed docs across all folders (default 30). */
export async function listRecents(ownerId: string, limit = 30): Promise<DocRow[]> {
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
    .where(and(eq(schema.documents.ownerId, ownerId), isNull(schema.documents.trashedAt)))
    .orderBy(desc(schema.documents.updatedAt))
    .limit(limit)
}

/** Starred, non-trashed docs, newest-first. */
export async function listStarred(ownerId: string): Promise<DocRow[]> {
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
    .where(
      and(
        eq(schema.documents.ownerId, ownerId),
        isNull(schema.documents.trashedAt),
        eq(schema.documents.starred, true),
      ),
    )
    .orderBy(desc(schema.documents.updatedAt))
}

/** A trashed doc row also carries trashedAt so the UI can show days-until-purge. */
export type TrashedDocRow = DocRow & { trashedAt: Date | null }

/** Trashed docs (trashedAt not null), most-recently-trashed first. */
export async function listTrashed(ownerId: string): Promise<TrashedDocRow[]> {
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
      // J11-3: surface when the doc was trashed so the list can show the countdown.
      trashedAt: schema.documents.trashedAt,
    })
    .from(schema.documents)
    .where(and(eq(schema.documents.ownerId, ownerId), isNotNull(schema.documents.trashedAt)))
    .orderBy(desc(schema.documents.trashedAt))
}

/** Toggle a doc's star (owner-scoped). */
export async function setStarred(ownerId: string, id: string, starred: boolean): Promise<void> {
  await db
    .update(schema.documents)
    .set({ starred, updatedAt: new Date() })
    .where(and(eq(schema.documents.id, id), eq(schema.documents.ownerId, ownerId)))
}

/** Soft-delete: set trashedAt = now (owner-scoped). */
export async function trashDocument(ownerId: string, id: string): Promise<void> {
  await db
    .update(schema.documents)
    .set({ trashedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.documents.id, id), eq(schema.documents.ownerId, ownerId)))

  // SECURITY (G1): revoke any share links on trash. Trashing is the owner's
  // "take it down" gesture; it only soft-deletes (sets trashedAt) so the share
  // FK cascade — which fires only on HARD delete — does not run. Without this,
  // an active share link would keep serving the trashed doc's title + content to
  // anonymous visitors. Owner-scoped: only the owner's shares for their own doc.
  await db
    .delete(schema.shares)
    .where(and(eq(schema.shares.docId, id), eq(schema.shares.ownerId, ownerId)))

  // Best-effort disk mirror — remove the mirrored file.
  await removeDocFromDisk(id)
}

/** Restore: set trashedAt = null (owner-scoped). */
export async function restoreDocument(ownerId: string, id: string): Promise<void> {
  await db
    .update(schema.documents)
    .set({ trashedAt: null, updatedAt: new Date() })
    .where(and(eq(schema.documents.id, id), eq(schema.documents.ownerId, ownerId)))

  // Best-effort disk mirror — re-mirror on restore.
  await syncDocToDisk(id)
}

/**
 * J11-1: PERMANENTLY delete a single TRASHED doc (owner-scoped). Only deletes when
 * the doc is owned by `ownerId` AND already in the trash (trashedAt IS NOT NULL) —
 * a live doc is never hard-deleted by this path. Removes the disk mirror (BEFORE the
 * row, since removeDocFromDisk reads diskPath) and the asset directory (AFTER). FK
 * cascades clear shares / permissions / links / comments. Returns true if a row was
 * deleted. NEVER throws on the best-effort fs cleanup.
 */
export async function deleteDocumentPermanently(ownerId: string, id: string): Promise<boolean> {
  // Gate: must be owned AND trashed.
  const [doc] = await db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.id, id),
        eq(schema.documents.ownerId, ownerId),
        isNotNull(schema.documents.trashedAt),
      ),
    )
    .limit(1)
  if (!doc) return false

  // Remove the mirrored file first (reads diskPath off the still-present row).
  await removeDocFromDisk(id)

  const result = await db
    .delete(schema.documents)
    .where(and(eq(schema.documents.id, id), eq(schema.documents.ownerId, ownerId)))

  // Clean the asset directory after the row is gone (best-effort, never throws).
  await removeAssetsForDoc({ id })

  return (result.rowCount ?? 0) > 0
}

/**
 * E11: Permanently delete trashed docs older than `retentionDays` for this owner.
 * No-op if retentionDays <= 0. Only touches docs where trashedAt is not null.
 * Returns the count purged.
 */
export async function purgeExpiredTrash(ownerId: string, retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const result = await db
    .delete(schema.documents)
    .where(
      and(
        eq(schema.documents.ownerId, ownerId),
        isNotNull(schema.documents.trashedAt),
        lt(schema.documents.trashedAt, cutoff),
      ),
    )
  return result.rowCount ?? 0
}

/**
 * E11: Permanently delete ALL trashed docs for this owner.
 * Only touches docs where trashedAt is not null.
 * Returns the count deleted.
 */
export async function emptyTrash(ownerId: string): Promise<number> {
  const result = await db
    .delete(schema.documents)
    .where(and(eq(schema.documents.ownerId, ownerId), isNotNull(schema.documents.trashedAt)))
  return result.rowCount ?? 0
}

/**
 * Move a doc to a folder (null = root). Owner-scoped by id.
 *
 * §7g IDOR: `actingUserId` is REQUIRED. When a non-null `folderId` is given, the
 * target folder MUST be owned by that user — otherwise a user could move a doc
 * into ANOTHER user's folder tree (revealing the folder's existence and injecting
 * content). A missing or foreign folder is indistinguishable from a denied one:
 * we throw `{ status: 404 }` (no existence leak), which the route maps to a 404.
 *
 * The SAME guard applies to any future write that accepts a `folderId`
 * (create-in-folder, duplicate-to-folder, from-template-in-folder, bulk-move):
 * resolve the folder row, assert `folder.ownerId === actingUserId`, throw 404 on
 * mismatch — before committing.
 */
export async function moveDocument(
  id: string,
  folderId: string | null,
  actingUserId: string,
): Promise<void> {
  if (folderId !== null) {
    const [folder] = await db
      .select({ ownerId: schema.folders.ownerId })
      .from(schema.folders)
      .where(eq(schema.folders.id, folderId))
      .limit(1)
    if (!folder || folder.ownerId !== actingUserId) {
      throw Object.assign(new Error('folder_not_found'), { status: 404 })
    }
  }
  await db
    .update(schema.documents)
    .set({ folderId, updatedAt: new Date() })
    .where(eq(schema.documents.id, id))

  // Best-effort disk mirror — folder changed → relocate.
  await syncDocToDisk(id)
}

/** Rename a doc's title (owner-scoped). Rejects empty/whitespace title. */
export async function renameDocument(ownerId: string, id: string, title: string): Promise<void> {
  const trimmed = title.trim()
  if (trimmed.length === 0) throw new Error('empty title')
  await db
    .update(schema.documents)
    .set({ title: trimmed, updatedAt: new Date() })
    .where(and(eq(schema.documents.id, id), eq(schema.documents.ownerId, ownerId)))

  // Best-effort disk mirror — title changed → relocate.
  await syncDocToDisk(id)
}

/** Duplicate a doc: new row, title "{title} (copy)", same content/markdown/folderId,
 *  owned by ownerId, not trashed, not starred. Returns the new id. Throws if the
 *  source doc isn't owned by ownerId. */
export async function duplicateDocument(ownerId: string, id: string): Promise<{ id: string }> {
  const src = await getDocument(id)
  if (!src || src.ownerId !== ownerId) throw new Error('not found')
  const [row] = await db
    .insert(schema.documents)
    .values({
      ownerId,
      title: `${src.title} (copy)`,
      content: src.content,
      markdown: src.markdown ?? '',
      folderId: src.folderId ?? undefined,
      starred: false,
    })
    .returning({ id: schema.documents.id })
  if (!row) throw new Error('duplicateDocument: insert returned no row')

  // Best-effort disk mirror — write the copy.
  await syncDocToDisk(row.id)

  return { id: row.id }
}

/**
 * G9: Merge a watermark config into documents.meta.watermark (owner-scoped).
 * Preserves all other keys in the meta jsonb column.
 * cfg=null → removes the watermark key.
 */
export async function setDocumentWatermark(
  ownerId: string,
  docId: string,
  cfg: WatermarkConfig,
): Promise<boolean> {
  // Read existing meta to preserve other keys
  const [row] = await db
    .select({ meta: schema.documents.meta })
    .from(schema.documents)
    .where(and(eq(schema.documents.id, docId), eq(schema.documents.ownerId, ownerId)))
    .limit(1)
  if (!row) return false // doc not found or not owned by this user

  const existingMeta =
    row.meta !== null &&
    row.meta !== undefined &&
    typeof row.meta === 'object' &&
    !Array.isArray(row.meta)
      ? (row.meta as Record<string, unknown>)
      : {}

  const updatedMeta: Record<string, unknown> = { ...existingMeta, watermark: cfg }

  await db
    .update(schema.documents)
    .set({ meta: updatedMeta, updatedAt: new Date() })
    .where(and(eq(schema.documents.id, docId), eq(schema.documents.ownerId, ownerId)))

  return true
}

/**
 * G17: Merge custom CSS into documents.meta.customCss (owner-scoped).
 * Preserves all other keys in the meta jsonb column (e.g. watermark from G9).
 * Stores the raw-but-parsed CSS; sanitize+scope happen at render time so the
 * user can re-open and edit their original input.
 */
export async function setDocumentCustomCss(
  ownerId: string,
  docId: string,
  css: string,
): Promise<boolean> {
  // Read existing meta to preserve other keys (watermark, etc.)
  const [row] = await db
    .select({ meta: schema.documents.meta })
    .from(schema.documents)
    .where(and(eq(schema.documents.id, docId), eq(schema.documents.ownerId, ownerId)))
    .limit(1)
  if (!row) return false // doc not found or not owned by this user

  const existingMeta =
    row.meta !== null &&
    row.meta !== undefined &&
    typeof row.meta === 'object' &&
    !Array.isArray(row.meta)
      ? (row.meta as Record<string, unknown>)
      : {}

  const updatedMeta: Record<string, unknown> = { ...existingMeta, customCss: parseCustomCss(css) }

  await db
    .update(schema.documents)
    .set({ meta: updatedMeta, updatedAt: new Date() })
    .where(and(eq(schema.documents.id, docId), eq(schema.documents.ownerId, ownerId)))

  return true
}

/**
 * J10/J12: shallow-merge `patch` into documents.meta (owner-scoped), preserving all
 * other keys (watermark/customCss/etc.). Returns false when the doc is not found or
 * not owned by this user. A patch value of `undefined` is written as-is (callers
 * delete a key by spreading a meta without it; we keep this simple shallow merge to
 * match the existing watermark/customCss writers). NEVER reached for a foreign doc.
 */
export async function mergeDocMeta(
  ownerId: string,
  docId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const [row] = await db
    .select({ meta: schema.documents.meta })
    .from(schema.documents)
    .where(and(eq(schema.documents.id, docId), eq(schema.documents.ownerId, ownerId)))
    .limit(1)
  if (!row) return false

  const existingMeta =
    row.meta !== null &&
    row.meta !== undefined &&
    typeof row.meta === 'object' &&
    !Array.isArray(row.meta)
      ? (row.meta as Record<string, unknown>)
      : {}

  const updatedMeta: Record<string, unknown> = { ...existingMeta, ...patch }

  await db
    .update(schema.documents)
    .set({ meta: updatedMeta, updatedAt: new Date() })
    .where(and(eq(schema.documents.id, docId), eq(schema.documents.ownerId, ownerId)))

  return true
}

/**
 * J10-2: persist the per-doc writing goal into documents.meta.writingGoal
 * (owner-scoped). `targetWords <= 0` clears the goal. Returns false if not owned.
 */
export async function setDocumentWritingGoal(
  ownerId: string,
  docId: string,
  targetWords: number,
): Promise<boolean> {
  const target = Number.isFinite(targetWords) ? Math.max(0, Math.round(targetWords)) : 0
  const writingGoal = target > 0 ? { targetWords: target } : null
  return mergeDocMeta(ownerId, docId, { writingGoal })
}

/**
 * J12-2: persist the per-doc theme override into documents.meta.theme (owner-scoped).
 * `theme` is the ALREADY-VALIDATED DocTheme (parseDocTheme'd by the route) — an empty
 * object clears the override. Returns false if not owned. Token-only by construction
 * (no raw CSS ever stored here).
 */
export async function setDocumentTheme(
  ownerId: string,
  docId: string,
  theme: Record<string, unknown>,
): Promise<boolean> {
  const value = Object.keys(theme).length > 0 ? theme : null
  return mergeDocMeta(ownerId, docId, { theme: value })
}
