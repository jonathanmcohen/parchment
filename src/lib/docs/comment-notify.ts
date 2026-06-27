import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/db'
import { sendNotification } from '@/lib/notifications/send'

// ── H Task 11 — @mention → notification (via Group B) ──────────────────────
//
// `parseMentions` extracts `@username` tokens; this resolves each to a `users` row
// by NAME (the mention token matches the user's display name — `parseMentions` only
// captures single `\w+` tokens), de-dupes, drops the comment author (no self-notify)
// and an unknown mention (sends nothing), then dispatches via B's sendNotification.
//
// B owns `@/lib/notifications/send` (reconciliation §1e); H imports it and codes to
// its contract (gracefully no-ops when SMTP is unconfigured). H does NOT build SMTP.
// Every send is BEST-EFFORT + NON-BLOCKING (mirrors fireCommentCreated): a mail
// failure must NEVER fail comment creation. Callers `void` this (or it self-voids).

/**
 * Resolve mentions → users by name and notify each (de-duped, author dropped).
 * Non-blocking: wraps its own async work in a void IIFE and swallows all errors, so
 * the caller can `notifyMentions(...)` without awaiting. `authorId` null = an
 * anonymous-via-share-link author (nobody is excluded as "self").
 */
export function notifyMentions(
  docId: string,
  authorId: string | null,
  body: string,
  mentions: string[],
): void {
  void (async () => {
    try {
      const names = Array.from(new Set(mentions.map((m) => m.trim()).filter(Boolean)))
      if (names.length === 0) return

      const rows = await db
        .select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users)
        .where(inArray(schema.users.name, names))

      // Resolve the comment author's display name + the doc title for the message.
      const [doc] = await db
        .select({ title: schema.documents.title })
        .from(schema.documents)
        .where(eqDocId(docId))
        .limit(1)
      const docTitle = doc?.title ?? 'a document'
      const authorName = await resolveAuthorName(authorId)

      const snippet = body.length > 140 ? `${body.slice(0, 140)}…` : body

      for (const u of rows) {
        if (authorId && u.id === authorId) continue // no self-notify
        // Best-effort per recipient; a single failure never aborts the rest.
        await sendNotification({
          userId: u.id,
          subject: `${authorName} mentioned you in “${docTitle}”`,
          text: `${authorName} mentioned you in a comment on “${docTitle}”:\n\n${snippet}`,
        }).catch(() => {})
      }
    } catch {
      // best-effort — commenting must not fail on a mention-resolution/mail error
    }
  })()
}

// Local helpers kept tiny + dependency-free (avoid importing the whole docs repo).
function eqDocId(docId: string) {
  return eq(schema.documents.id, docId)
}

async function resolveAuthorName(authorId: string | null): Promise<string> {
  if (!authorId) return 'Someone'
  const [u] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, authorId))
    .limit(1)
  return u?.name ?? 'Someone'
}
