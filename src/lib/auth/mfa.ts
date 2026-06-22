// Pure MFA logic — TOTP (RFC-6238) + recovery-code helpers.
//
// Intentionally framework-free and side-effect-free so it can be unit-tested in
// node without a DB, timers, or secrets. It is imported ONLY by server route
// handlers / the mfa-repo (never by a client component), so it does not need the
// 'server-only' guard — which would also break the unit tests. The crypto here
// (`otpauth`, `node:crypto`) is pure JS with no native deps and is safe in a
// server bundle; it must never be pulled into a client bundle.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { Secret, TOTP } from 'otpauth'

export const TOTP_DIGITS = 6
export const TOTP_PERIOD_SECONDS = 30
// ±1 step tolerance (RFC-6238 §5.2): one step before/after for clock skew.
export const TOTP_WINDOW = 1
export const TOTP_ISSUER = 'Parchment'

// Default number of single-use recovery codes minted at enrollment.
export const RECOVERY_CODE_COUNT = 10
// Bytes of entropy per recovery code half-block (4 hex chars per 2 bytes).
const RECOVERY_BLOCK_BYTES = 2
const RECOVERY_BLOCKS = 2

// A normalized recovery code is two 4-char lowercase hex blocks joined by '-'.
export const RECOVERY_CODE_RE = /^[0-9a-f]{4}-[0-9a-f]{4}$/
const SIX_DIGITS_RE = /^[0-9]{6}$/

// ─── TOTP ────────────────────────────────────────────────────────────────────

// A fresh base32 secret (160 bits / 32 base32 chars — the RFC-4226 recommended
// minimum). Uses the library's CSPRNG-backed Secret, never Math.random.
export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32
}

// The otpauth:// provisioning URI an authenticator app scans from the QR code.
export function totpUri(secret: string, accountName: string, issuer = TOTP_ISSUER): string {
  const totp = new TOTP({
    issuer,
    label: accountName,
    secret: Secret.fromBase32(secret),
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
  })
  return totp.toString()
}

// Verifies a submitted token against a secret at `nowMs` (injectable so tests
// are deterministic). Rejects anything that is not exactly 6 digits BEFORE
// touching the secret, and tolerates ±1 step of clock skew.
export function verifyTotp(secret: string, token: string, nowMs: number = Date.now()): boolean {
  const cleaned = token.trim()
  if (!SIX_DIGITS_RE.test(cleaned)) return false

  let totp: TOTP
  try {
    totp = new TOTP({
      secret: Secret.fromBase32(secret),
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
    })
  } catch {
    // Malformed secret — treat as a non-match rather than throwing.
    return false
  }

  const delta = totp.validate({ token: cleaned, timestamp: nowMs, window: TOTP_WINDOW })
  return delta !== null
}

// ─── Recovery codes ──────────────────────────────────────────────────────────

// `n` unique, human-formatted single-use recovery codes (e.g. `1a2b-3c4d`).
// Uses crypto.randomBytes; loops until `n` distinct codes are collected (a
// collision across CSPRNG-random 32-bit codes is astronomically unlikely, but
// the de-dup keeps the contract honest).
export function generateRecoveryCodes(n: number = RECOVERY_CODE_COUNT): string[] {
  const out = new Set<string>()
  while (out.size < n) {
    out.add(randomRecoveryCode())
  }
  return [...out]
}

function randomRecoveryCode(): string {
  const blocks: string[] = []
  for (let i = 0; i < RECOVERY_BLOCKS; i++) {
    blocks.push(randomBytes(RECOVERY_BLOCK_BYTES).toString('hex'))
  }
  return blocks.join('-')
}

// Canonical form for comparison: lowercase, separators/whitespace stripped. A
// user may type `ABCD-EF12`, `abcd ef12`, or `abcdef12` — all normalize equal.
export function formatRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^0-9a-f]/g, '')
}

// ─── Constant-time helpers ───────────────────────────────────────────────────

// Length-safe, constant-time string compare. Returns false on length mismatch
// (timingSafeEqual throws on differing lengths) without leaking via early exit.
export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// Finds the index of the stored hash that verifies the submitted plaintext code,
// or -1 if none match. The `verify` callback is injected (argon2 in production)
// to keep this module free of server-only deps and unit-testable. ALL stored
// hashes are checked (no early return) so the work is independent of which slot
// matches — a recovery-code verifier should not reveal position via timing.
export async function countMatchingRecoveryHash(
  hashes: readonly string[],
  plaintext: string,
  verify: (hash: string, plaintext: string) => Promise<boolean>,
): Promise<number> {
  let match = -1
  for (let i = 0; i < hashes.length; i++) {
    const hash = hashes[i]
    if (hash === undefined) continue
    if (await verify(hash, plaintext)) {
      if (match === -1) match = i
    }
  }
  return match
}
