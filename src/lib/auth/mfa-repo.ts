import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { countMatchingRecoveryHash, formatRecoveryCode } from '@/lib/auth/mfa'
import { hashPassword, verifyPassword } from '@/lib/auth/password'

export type MfaRow = typeof schema.userMfa.$inferSelect
export type PasskeyRow = typeof schema.passkeys.$inferSelect

// Recovery codes are stored as a jsonb string[] of argon2 hashes. Drizzle types
// jsonb columns as `unknown`; narrow defensively at the boundary.
function recoveryHashesOf(row: MfaRow): string[] {
  const value = row.recoveryCodes
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

export async function getMfa(userId: string): Promise<MfaRow | null> {
  const [row] = await db
    .select()
    .from(schema.userMfa)
    .where(eq(schema.userMfa.userId, userId))
    .limit(1)
  return row ?? null
}

// Stores a provisional TOTP secret + the argon2-hashed recovery codes, WITHOUT
// enabling TOTP (totpEnabledAt stays null until /enable confirms a live code).
// Upserts so a user who restarts enrollment overwrites the prior provisional row.
export async function setTotp(
  userId: string,
  secret: string,
  recoveryHashes: string[],
): Promise<void> {
  await db
    .insert(schema.userMfa)
    .values({
      userId,
      totpSecret: secret,
      totpEnabledAt: null,
      recoveryCodes: recoveryHashes,
    })
    .onConflictDoUpdate({
      target: schema.userMfa.userId,
      set: { totpSecret: secret, totpEnabledAt: null, recoveryCodes: recoveryHashes },
    })
}

// Marks TOTP enabled (only meaningful after a provisional secret is set).
export async function enableTotp(userId: string): Promise<void> {
  await db
    .update(schema.userMfa)
    .set({ totpEnabledAt: new Date() })
    .where(eq(schema.userMfa.userId, userId))
}

// Fully clears TOTP for a user: drops the secret, the enabled flag, and the
// recovery codes. Leaves passkeys untouched (a separate second factor).
export async function disableTotp(userId: string): Promise<void> {
  await db
    .update(schema.userMfa)
    .set({ totpSecret: null, totpEnabledAt: null, recoveryCodes: [] })
    .where(eq(schema.userMfa.userId, userId))
}

// Verifies a submitted recovery code against the stored argon2 hashes and, on a
// match, removes that single hash (single-use). Returns true iff a code was
// consumed. The plaintext is normalized the same way it was at minting.
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const row = await getMfa(userId)
  if (!row || row.totpEnabledAt === null) return false

  const hashes = recoveryHashesOf(row)
  if (hashes.length === 0) return false

  const normalized = formatRecoveryCode(code)
  if (normalized.length === 0) return false

  const matchIdx = await countMatchingRecoveryHash(hashes, normalized, verifyPassword)
  if (matchIdx < 0) return false

  const remaining = hashes.filter((_, i) => i !== matchIdx)
  await db
    .update(schema.userMfa)
    .set({ recoveryCodes: remaining })
    .where(eq(schema.userMfa.userId, userId))
  return true
}

// Hashes plaintext recovery codes (argon2) for storage. The plaintext is shown
// to the user once and never persisted.
export async function hashRecoveryCodes(plaintextCodes: string[]): Promise<string[]> {
  return Promise.all(plaintextCodes.map((c) => hashPassword(formatRecoveryCode(c))))
}

// ─── Passkeys ────────────────────────────────────────────────────────────────

export async function listPasskeys(userId: string): Promise<PasskeyRow[]> {
  return db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, userId))
}

export async function addPasskey(input: {
  id: string
  userId: string
  publicKey: string
  counter: number
  transports: string[] | null
  label: string
}): Promise<void> {
  await db.insert(schema.passkeys).values({
    id: input.id,
    userId: input.userId,
    publicKey: input.publicKey,
    counter: input.counter,
    transports: input.transports,
    label: input.label,
  })
}

export async function removePasskey(userId: string, id: string): Promise<void> {
  await db
    .delete(schema.passkeys)
    .where(and(eq(schema.passkeys.userId, userId), eq(schema.passkeys.id, id)))
}

export async function getPasskeyById(id: string): Promise<PasskeyRow | null> {
  const [row] = await db.select().from(schema.passkeys).where(eq(schema.passkeys.id, id)).limit(1)
  return row ?? null
}

export async function bumpPasskeyCounter(id: string, counter: number): Promise<void> {
  await db.update(schema.passkeys).set({ counter }).where(eq(schema.passkeys.id, id))
}

// True if the user has ANY active second factor: enabled TOTP or ≥1 passkey.
// This is the gate the login flow consults after the password step.
export async function userHasSecondFactor(userId: string): Promise<boolean> {
  const [mfa] = await db
    .select({ enabledAt: schema.userMfa.totpEnabledAt })
    .from(schema.userMfa)
    .where(eq(schema.userMfa.userId, userId))
    .limit(1)

  if (mfa?.enabledAt) return true

  const [passkeyCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.passkeys)
    .where(eq(schema.passkeys.userId, userId))

  return (passkeyCount?.n ?? 0) > 0
}
