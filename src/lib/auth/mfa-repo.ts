import 'server-only'
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { countMatchingRecoveryHash, formatRecoveryCode } from '@/lib/auth/mfa'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { DecryptError, decryptSecret, encryptSecret } from '@/lib/crypto/secret-box'

export type MfaRow = typeof schema.userMfa.$inferSelect
export type PasskeyRow = typeof schema.passkeys.$inferSelect

// §2 (encrypt-at-rest): the TOTP base32 secret and the argon2 recovery-code hashes
// are encrypted via the Phase-0 secret-box BEFORE they touch the DB, and decrypted
// transparently on read, so a DB-only dump exposes neither. The recovery codes are
// already argon2-hashed (one-way); encrypting the hashes too means a stolen dump
// can't even be offline-attacked against the recovery code space. Encryption is a
// repo-boundary concern: every consumer of getMfa() still sees the plaintext base32
// secret + the argon2 hash array exactly as before — only the at-rest bytes change.
// Fail-closed: a value that does not decrypt (corrupt/foreign/legacy-plaintext
// envelope, or missing key) is treated as absent rather than surfaced raw.
function decryptOrNull(envelope: string | null): string | null {
  if (envelope === null) return null
  try {
    return decryptSecret(envelope)
  } catch (err) {
    if (err instanceof DecryptError) return null
    throw err
  }
}

// Recovery codes are stored as a jsonb string[] of ENCRYPTED argon2 hashes. Decrypt
// each back to the argon2 hash on read; an entry that fails to decrypt is dropped
// (fail-closed). Drizzle types jsonb columns as `unknown`; narrow defensively.
function decryptRecoveryCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) {
    if (typeof v !== 'string') continue
    const plain = decryptOrNull(v)
    if (plain !== null) out.push(plain)
  }
  return out
}

// Encrypt an array of argon2 hashes for storage (one envelope per hash).
function encryptRecoveryCodes(hashes: string[]): string[] {
  return hashes.map((h) => encryptSecret(h))
}

// Recovery codes on a DECRYPTED row are the plaintext argon2 hashes.
function recoveryHashesOf(row: MfaRow): string[] {
  const value = row.recoveryCodes
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

// Returns the row with totpSecret + recoveryCodes DECRYPTED in place, so callers
// never deal with envelopes. A row whose totpSecret can't be decrypted comes back
// with totpSecret = null (fail-closed).
export async function getMfa(userId: string): Promise<MfaRow | null> {
  const [row] = await db
    .select()
    .from(schema.userMfa)
    .where(eq(schema.userMfa.userId, userId))
    .limit(1)
  if (!row) return null
  return {
    ...row,
    totpSecret: decryptOrNull(row.totpSecret),
    recoveryCodes: decryptRecoveryCodes(row.recoveryCodes),
  }
}

// Stores a provisional TOTP secret + the argon2-hashed recovery codes, WITHOUT
// enabling TOTP (totpEnabledAt stays null until /enable confirms a live code).
// Upserts so a user who restarts enrollment overwrites the prior provisional row.
export async function setTotp(
  userId: string,
  secret: string,
  recoveryHashes: string[],
): Promise<void> {
  // §2: encrypt the base32 secret + each recovery-code hash at rest.
  const encSecret = encryptSecret(secret)
  const encCodes = encryptRecoveryCodes(recoveryHashes)
  await db
    .insert(schema.userMfa)
    .values({
      userId,
      totpSecret: encSecret,
      totpEnabledAt: null,
      recoveryCodes: encCodes,
      lastTotpStep: null,
    })
    .onConflictDoUpdate({
      target: schema.userMfa.userId,
      // Reset the replay watermark: a fresh provisional secret starts a new
      // step lineage, so a stale high step must not block the first new code.
      set: {
        totpSecret: encSecret,
        totpEnabledAt: null,
        recoveryCodes: encCodes,
        lastTotpStep: null,
      },
    })
}

// Marks TOTP enabled (only meaningful after a provisional secret is set).
export async function enableTotp(userId: string): Promise<void> {
  await db
    .update(schema.userMfa)
    .set({ totpEnabledAt: new Date() })
    .where(eq(schema.userMfa.userId, userId))
}

// Records the highest TOTP time-step accepted for a user (RFC-6238 §5.2 replay
// guard). Conditioned on the stored step being null or strictly less than the
// new one, so a concurrent request cannot lower it. Returns true iff the step was
// advanced — a false result means the token's step was already consumed (replay)
// and the caller must reject the login. The condition makes the
// check-then-record sequence atomic against a parallel replay of the same code.
export async function recordTotpStep(userId: string, step: number): Promise<boolean> {
  const updated = await db
    .update(schema.userMfa)
    .set({ lastTotpStep: step })
    .where(
      and(
        eq(schema.userMfa.userId, userId),
        or(isNull(schema.userMfa.lastTotpStep), lt(schema.userMfa.lastTotpStep, step)),
      ),
    )
    .returning({ userId: schema.userMfa.userId })
  return updated.length > 0
}

// Fully clears TOTP for a user: drops the secret, the enabled flag, and the
// recovery codes. Leaves passkeys untouched (a separate second factor).
export async function disableTotp(userId: string): Promise<void> {
  await db
    .update(schema.userMfa)
    .set({ totpSecret: null, totpEnabledAt: null, recoveryCodes: [], lastTotpStep: null })
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

  // `hashes` here are the DECRYPTED argon2 hashes (getMfa decrypted them). Re-encrypt
  // the remaining ones before writing back so the column stays encrypted at rest.
  const remaining = hashes.filter((_, i) => i !== matchIdx)
  await db
    .update(schema.userMfa)
    .set({ recoveryCodes: encryptRecoveryCodes(remaining) })
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
