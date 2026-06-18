import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'

export const PAT_PREFIX = 'pat_'

export type PatUser = typeof schema.users.$inferSelect

export type IssuedPat = {
  id: string
  name: string
  tokenPrefix: string
  // Plaintext token — shown to the caller exactly once, never persisted.
  token: string
}

// sha256 hex of the full token. Tokens carry ~256 bits of entropy, so a plain
// (unsalted) sha256 is sufficient and lets us look up by hash in one indexed query.
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hashToken(token: string): string {
  return sha256(token)
}

// 'pat_' + first 6 chars of the random body — safe to display, identifies the token.
function prefixOf(token: string): string {
  return token.slice(0, PAT_PREFIX.length + 6)
}

export async function issuePat(ownerId: string, name: string): Promise<IssuedPat> {
  const token = PAT_PREFIX + randomBytes(32).toString('base64url')
  const tokenHash = sha256(token)
  const tokenPrefix = prefixOf(token)

  const [row] = await db
    .insert(schema.pats)
    .values({ name, tokenHash, tokenPrefix, ownerId })
    .returning({ id: schema.pats.id, name: schema.pats.name, tokenPrefix: schema.pats.tokenPrefix })

  if (!row) throw new Error('Failed to issue personal access token')

  return { id: row.id, name: row.name, tokenPrefix: row.tokenPrefix, token }
}

export async function verifyPat(token: string): Promise<PatUser | null> {
  if (!token.startsWith(PAT_PREFIX)) return null

  const tokenHash = sha256(token)
  const [pat] = await db
    .select()
    .from(schema.pats)
    .where(eq(schema.pats.tokenHash, tokenHash))
    .limit(1)

  if (!pat) return null

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, pat.ownerId))
    .limit(1)

  if (!user) return null

  // Best-effort last-used stamp; never block auth on the bookkeeping write.
  void Promise.resolve(
    db.update(schema.pats).set({ lastUsedAt: new Date() }).where(eq(schema.pats.id, pat.id)),
  ).catch(() => {})

  return user
}

export async function revokePat(ownerId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(schema.pats)
    .where(and(eq(schema.pats.id, id), eq(schema.pats.ownerId, ownerId)))
    .returning({ id: schema.pats.id })

  return deleted.length > 0
}

export async function listPats(ownerId: string) {
  return db
    .select({
      id: schema.pats.id,
      name: schema.pats.name,
      tokenPrefix: schema.pats.tokenPrefix,
      lastUsedAt: schema.pats.lastUsedAt,
      createdAt: schema.pats.createdAt,
    })
    .from(schema.pats)
    .where(eq(schema.pats.ownerId, ownerId))
    .orderBy(schema.pats.createdAt)
}
