// A5: invitations. The accept token is 32 random bytes (base64url) shown/sent ONCE;
// only its sha256 is persisted (mirrors sessions/pats/shares discipline). Accepting
// within expiresAt creates the user (role from the invite) with the chosen password
// and marks the invite consumed in one transaction. No 'server-only' guard so it is
// integration-testable.
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { hashPassword } from '@/lib/auth/password'
import type { Role } from '@/lib/auth/roles'

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

export type InviteListItem = {
  id: string
  email: string
  role: string
  invitedBy: string | null
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
}

export async function createInvite(input: {
  email: string
  role: Role
  invitedBy: string
  ttlHours?: number
}): Promise<{ id: string; token: string }> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = sha256(token)
  const ttl = input.ttlHours ?? 72
  const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000)
  const [row] = await db
    .insert(schema.invites)
    .values({
      email: input.email.toLowerCase(),
      role: input.role,
      tokenHash,
      invitedBy: input.invitedBy,
      expiresAt,
    })
    .returning({ id: schema.invites.id })
  if (!row) throw new Error('createInvite: insert returned no row')
  return { id: row.id, token }
}

// Public-safe view of a token: returns the email+role for the accept page WITHOUT
// the hash, and only when the invite is live (unexpired, unconsumed). Null otherwise.
export async function getInviteByToken(
  token: string,
): Promise<{ email: string; role: string } | null> {
  if (!token) return null
  const [row] = await db
    .select({ email: schema.invites.email, role: schema.invites.role })
    .from(schema.invites)
    .where(
      and(
        eq(schema.invites.tokenHash, sha256(token)),
        gt(schema.invites.expiresAt, new Date()),
        isNull(schema.invites.acceptedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

// Accept: validate the live token, create the user (or set the password on a
// pre-created disabled placeholder with this email), consume the invite. Atomic.
// Returns { ok, userId } on success; { ok:false } for an invalid/expired/used token
// or a now-duplicate email.
export async function acceptInvite(
  token: string,
  profile: { name: string; password: string },
): Promise<{ ok: true; userId: string } | { ok: false }> {
  if (profile.password.length < 8) return { ok: false }
  const passwordHash = await hashPassword(profile.password)
  const tokenHash = sha256(token)

  return db.transaction(async (tx) => {
    // Claim the invite by stamping acceptedAt only if still live — this row update
    // is the concurrency gate (a second accept matches no live row).
    const claimed = await tx
      .update(schema.invites)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(schema.invites.tokenHash, tokenHash),
          gt(schema.invites.expiresAt, new Date()),
          isNull(schema.invites.acceptedAt),
        ),
      )
      .returning({ email: schema.invites.email, role: schema.invites.role })
    const invite = claimed[0]
    if (!invite) return { ok: false as const }

    // If a disabled placeholder user already exists for this email, activate it;
    // otherwise create a fresh user. The invited role wins.
    const [existing] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, invite.email))
      .limit(1)

    if (existing) {
      await tx
        .update(schema.users)
        .set({ name: profile.name, passwordHash, role: invite.role, disabledAt: null })
        .where(eq(schema.users.id, existing.id))
      return { ok: true as const, userId: existing.id }
    }

    const [created] = await tx
      .insert(schema.users)
      .values({
        email: invite.email,
        name: profile.name,
        passwordHash,
        role: invite.role,
        // I2: apply the configured default quota for new invited users (§7d:
        // this is the invited path; setup/actions.ts owner stays unaffected).
        quotaMb: (() => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { env } = require('@/lib/env') as { env: { defaultQuotaMb: number } }
            return env.defaultQuotaMb
          } catch { return 0 }
        })(),
      })
      .returning({ id: schema.users.id })
    if (!created) return { ok: false as const }
    return { ok: true as const, userId: created.id }
  })
}

export async function revokeInvite(id: string): Promise<void> {
  await db.delete(schema.invites).where(eq(schema.invites.id, id))
}

export async function listInvites(): Promise<InviteListItem[]> {
  return db
    .select({
      id: schema.invites.id,
      email: schema.invites.email,
      role: schema.invites.role,
      invitedBy: schema.invites.invitedBy,
      expiresAt: schema.invites.expiresAt,
      acceptedAt: schema.invites.acceptedAt,
      createdAt: schema.invites.createdAt,
    })
    .from(schema.invites)
    .where(isNull(schema.invites.acceptedAt))
    .orderBy(schema.invites.createdAt)
}

export async function expireInvites(): Promise<number> {
  const res = await db
    .delete(schema.invites)
    .where(and(isNull(schema.invites.acceptedAt), sql`${schema.invites.expiresAt} < now()`))
  return res.rowCount ?? 0
}
