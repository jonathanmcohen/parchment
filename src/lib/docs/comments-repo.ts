import { and, asc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { dispatchWebhooks } from '@/lib/integrations/webhook-dispatch'

// D1 comments data layer. No 'server-only' guard so the repo stays unit-testable.
// Pure helpers + the JSON row type live in comments-shared.ts (client-safe).

export type Comment = typeof schema.comments.$inferSelect

// Re-export the pure mention parser so existing importers keep working.
export { parseMentions } from '@/lib/docs/comments-shared'

// J7: fire `comment.created` to the doc owner's webhooks, NON-BLOCKING. Resolves
// the doc's ownerId (a comment row carries docId, not ownerId) and includes a
// short snippet of the body. Wrapped + `void`-ed so the owner lookup and the
// dispatch can never fail or slow comment creation. Shared by createThread and
// addReply.
function fireCommentCreated(docId: string, body: string): void {
  void (async () => {
    try {
      const [doc] = await db
        .select({ ownerId: schema.documents.ownerId })
        .from(schema.documents)
        .where(eq(schema.documents.id, docId))
        .limit(1)
      if (!doc) return
      await dispatchWebhooks(doc.ownerId, 'comment.created', {
        docId,
        snippet: body.slice(0, 140),
      })
    } catch {
      // best-effort — commenting must not fail on a webhook/owner-lookup error
    }
  })()
}

// ─── createThread ─────────────────────────────────────────────────────────────

export async function createThread(
  docId: string,
  authorId: string | null,
  opts: { body: string; anchorFrom?: number; anchorTo?: number; mentions?: string[] },
): Promise<{ id: string; threadId: string }> {
  const [row] = await db
    .insert(schema.comments)
    .values({
      docId,
      threadId: '00000000-0000-0000-0000-000000000000', // placeholder; updated below
      authorId: authorId ?? null,
      body: opts.body,
      mentions: opts.mentions ?? [],
      anchorFrom: opts.anchorFrom ?? null,
      anchorTo: opts.anchorTo ?? null,
      resolved: false,
    })
    .returning({ id: schema.comments.id })

  if (!row) throw new Error('createThread: insert returned no row')

  // Set threadId = id (root comment is its own thread anchor)
  await db.update(schema.comments).set({ threadId: row.id }).where(eq(schema.comments.id, row.id))

  fireCommentCreated(docId, opts.body)

  return { id: row.id, threadId: row.id }
}

// ─── addReply ─────────────────────────────────────────────────────────────────

export async function addReply(
  docId: string,
  threadId: string,
  authorId: string | null,
  opts: { body: string; mentions?: string[] },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.comments)
    .values({
      docId,
      threadId,
      authorId: authorId ?? null,
      body: opts.body,
      mentions: opts.mentions ?? [],
      anchorFrom: null,
      anchorTo: null,
      resolved: false,
    })
    .returning({ id: schema.comments.id })

  if (!row) throw new Error('addReply: insert returned no row')

  fireCommentCreated(docId, opts.body)

  return { id: row.id }
}

// ─── listComments ─────────────────────────────────────────────────────────────

export async function listComments(docId: string): Promise<Comment[]> {
  return db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.docId, docId))
    .orderBy(asc(schema.comments.createdAt))
}

// ─── setResolved ──────────────────────────────────────────────────────────────
// §7e IDOR: `docId` is REQUIRED and the update double-filters on (id, docId) so a
// commentId belonging to a DIFFERENT doc can never be toggled via this doc's route.
// Returns the number of rows affected (0 = cross-doc / missing → route 404s).

export async function setResolved(
  threadId: string,
  docId: string,
  resolved: boolean,
): Promise<number> {
  // `resolved` is semantically on the root comment; update it there.
  // The root comment has id == threadId.
  const res = await db
    .update(schema.comments)
    .set({ resolved })
    .where(and(eq(schema.comments.id, threadId), eq(schema.comments.docId, docId)))
  return res.rowCount ?? 0
}

// ─── deleteComment ────────────────────────────────────────────────────────────
// §7e IDOR: `docId` is REQUIRED and the delete double-filters on (id, docId) so a
// commentId belonging to a DIFFERENT doc can never be deleted via this doc's route.
// Returns the number of rows affected (0 = cross-doc / missing → route 404s).

export async function deleteComment(id: string, docId: string): Promise<number> {
  const res = await db
    .delete(schema.comments)
    .where(and(eq(schema.comments.id, id), eq(schema.comments.docId, docId)))
  return res.rowCount ?? 0
}
