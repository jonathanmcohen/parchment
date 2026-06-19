import { asc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'

// D1 comments data layer. No 'server-only' guard so the repo stays unit-testable.

export type Comment = typeof schema.comments.$inferSelect

// ─── parseMentions ────────────────────────────────────────────────────────────

/**
 * Extract @mention tokens from a comment body.
 * Only matches `@word` preceded by start-of-string or whitespace so that
 * email addresses (a@b.com) are NOT captured.
 * Returns the usernames without the leading `@`.
 */
export function parseMentions(body: string): string[] {
  const matches = body.match(/(?:^|\s)@(\w+)/g) ?? []
  return matches.map((m) => m.replace(/.*@/, ''))
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

export async function setResolved(threadId: string, resolved: boolean): Promise<void> {
  // `resolved` is semantically on the root comment; update it there.
  // The root comment has id == threadId.
  await db.update(schema.comments).set({ resolved }).where(eq(schema.comments.id, threadId))
}

// ─── deleteComment ────────────────────────────────────────────────────────────

export async function deleteComment(id: string): Promise<void> {
  await db.delete(schema.comments).where(eq(schema.comments.id, id))
}
