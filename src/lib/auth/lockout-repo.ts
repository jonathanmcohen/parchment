import 'server-only'
import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/db'

// G4 — per-account brute-force lockout (defense beyond the per-IP throttle, which an
// attacker can bypass with a botnet / spoofed X-Forwarded-For). After
// LOCKOUT_THRESHOLD consecutive password failures for one account, that account is
// locked for LOCKOUT_DURATION_MS regardless of source IP. A successful login resets
// the counter. The table is keyed on a sha256 of the NORMALISED email — never the
// raw email — so the table can't be mined for the set of registered addresses.

// Lock after this many consecutive failures.
export const LOCKOUT_THRESHOLD = 5
// Cooldown once locked (15 minutes).
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000

// sha256 of the lowercased/trimmed email. The email is normalised the same way the
// login action normalises it, so the key is stable.
function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

export type LockoutStatus = { locked: boolean; until: Date | null }

// Returns whether the account is currently locked (lockedUntil in the future).
// A no-row account is never locked.
export async function getLockoutStatus(email: string): Promise<LockoutStatus> {
  const [row] = await db
    .select({ lockedUntil: schema.loginLockouts.lockedUntil })
    .from(schema.loginLockouts)
    .where(eq(schema.loginLockouts.emailHash, emailHash(email)))
    .limit(1)
  const until = row?.lockedUntil ?? null
  return { locked: until !== null && until.getTime() > Date.now(), until }
}

// Records one failed password attempt. Increments failedCount; when it reaches
// LOCKOUT_THRESHOLD the row is locked for LOCKOUT_DURATION_MS. Returns the new
// status so the caller can audit a fresh lockout trip. Upserts so the first
// failure creates the row.
export async function recordLoginFailure(email: string): Promise<LockoutStatus> {
  const key = emailHash(email)
  const now = new Date()
  // Atomic upsert: on conflict, increment and (conditionally) set lockedUntil when
  // the post-increment count crosses the threshold. Done in SQL so concurrent
  // failures can't race the read-modify-write.
  const lockUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS)
  const [row] = await db
    .insert(schema.loginLockouts)
    .values({ emailHash: key, failedCount: 1, lockedUntil: null, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.loginLockouts.emailHash,
      set: {
        failedCount: sql`${schema.loginLockouts.failedCount} + 1`,
        // Lock once the incremented count reaches the threshold; otherwise leave
        // any existing lock untouched (a still-locked account stays locked).
        lockedUntil: sql`CASE WHEN ${schema.loginLockouts.failedCount} + 1 >= ${LOCKOUT_THRESHOLD} THEN ${lockUntil.toISOString()}::timestamptz ELSE ${schema.loginLockouts.lockedUntil} END`,
        updatedAt: now,
      },
    })
    .returning({
      failedCount: schema.loginLockouts.failedCount,
      lockedUntil: schema.loginLockouts.lockedUntil,
    })
  const until = row?.lockedUntil ?? null
  return { locked: until !== null && until.getTime() > Date.now(), until }
}

// Clears the lockout row for an account after a successful login (or admin reset).
export async function resetLoginLockout(email: string): Promise<void> {
  await db.delete(schema.loginLockouts).where(eq(schema.loginLockouts.emailHash, emailHash(email)))
}
