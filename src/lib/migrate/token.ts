import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

// D — instance-migrate bearer token. Generated once on the target, hashed (sha256
// hex) and stored encrypted in app_config as `migrate.tokenHash`. The plaintext is
// shown to the operator exactly once. Verification is constant-time.

/** A CSPRNG token (32 bytes → base64url, ≥ 43 chars). Shown to the operator once. */
export function generateMigrateToken(): string {
  return randomBytes(32).toString('base64url')
}

/** sha256 hex of the token (64 chars). Deterministic — used for storage + compare. */
export function hashMigrateToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Constant-time check that `incoming` hashes to `storedHash`.
 *
 * Both sides are reduced to a fixed 64-char hex buffer BEFORE comparison so a
 * length difference never causes an early exit (timingSafeEqual requires equal
 * lengths; we hash the incoming token, which is always 64 hex chars, and validate
 * the stored hash is also 64 hex chars). A malformed/empty stored hash → false.
 */
export function verifyMigrateToken(incoming: string, storedHash: string): boolean {
  // The stored hash must be a well-formed 64-char hex string.
  if (!/^[0-9a-f]{64}$/.test(storedHash)) return false
  const incomingHash = hashMigrateToken(incoming) // always 64 hex chars
  const a = Buffer.from(incomingHash, 'hex')
  const b = Buffer.from(storedHash, 'hex')
  // Both are 32-byte buffers (64 hex chars) → timingSafeEqual is safe.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
