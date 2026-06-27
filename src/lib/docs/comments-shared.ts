// D1 comments — db-free shared module (safe to import from client components).
// The repo (`comments-repo.ts`) imports `@/db` (pg), so client code must import
// the pure helpers + JSON-shaped types from HERE, not from the repo.

/**
 * JSON shape of one Yjs RelativePosition boundary (`relativePositionToJSON`).
 * Stored in the `anchor_start`/`anchor_end` jsonb columns. Opaque to consumers —
 * only `serializeAnchor`/`resolveAnchor` interpret it.
 */
export type AnchorJson = Record<string, unknown>

/** JSON shape of a comment as returned by the API (dates serialize to strings). */
export interface CommentRow {
  id: string
  docId: string
  threadId: string
  authorId: string | null
  body: string
  mentions: string[]
  anchorFrom: number | null
  anchorTo: number | null
  // H1: durable Yjs RelativePosition anchors (null on replies + legacy rows).
  anchorStart: AnchorJson | null
  anchorEnd: AnchorJson | null
  resolved: boolean
  createdAt: string
}

/**
 * Extract @mention tokens from a comment body.
 * Only matches `@word` preceded by start-of-string or whitespace so that
 * email addresses (a@b.com) are NOT captured. Returns usernames without `@`.
 */
export function parseMentions(body: string): string[] {
  const matches = body.match(/(?:^|\s)@(\w+)/g) ?? []
  return matches.map((m) => m.replace(/.*@/, ''))
}
