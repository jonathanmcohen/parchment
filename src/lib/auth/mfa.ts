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
// Each recovery code carries 80 bits of CSPRNG entropy (10 bytes), rendered as
// Crockford-style base32 (16 chars). This replaces the previous 32-bit hex codes,
// which were weak for a credential that bypasses the second factor. 80 bits puts
// an online guess of an unused code far out of reach even without the attempt
// cap (which is the primary defense — see consumePendingFailure in session.ts).
const RECOVERY_ENTROPY_BYTES = 10
// Display grouping: 16 base32 chars shown as four 4-char blocks, e.g.
// `a3kf-9p2m-7xqz-bd4h`. The hyphens are cosmetic; formatRecoveryCode strips them.
const RECOVERY_GROUP = 4
// Crockford base32 alphabet (no I, L, O, U — avoids visual ambiguity).
const BASE32_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

// A normalized recovery code is 16 lowercase base32 chars (separators stripped).
export const RECOVERY_CODE_RE = /^[0-9a-hjkmnp-tv-z]{16}$/
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
  return verifyTotpStep(secret, token, nowMs) !== null
}

// Like verifyTotp but returns the ABSOLUTE time-step the token matched (or null
// on no match). The caller persists this step and rejects any future token whose
// step is <= the last accepted one, giving RFC-6238 §5.2 replay protection: a
// single live code (valid for up to ~90s across the ±1 window) cannot be reused.
// The step is `floor(nowMs/1000/period) + delta`, where delta ∈ {-1,0,+1}.
export function verifyTotpStep(
  secret: string,
  token: string,
  nowMs: number = Date.now(),
): number | null {
  const cleaned = token.trim()
  if (!SIX_DIGITS_RE.test(cleaned)) return null

  let totp: TOTP
  try {
    totp = new TOTP({
      secret: Secret.fromBase32(secret),
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
    })
  } catch {
    // Malformed secret — treat as a non-match rather than throwing.
    return null
  }

  const delta = totp.validate({ token: cleaned, timestamp: nowMs, window: TOTP_WINDOW })
  if (delta === null) return null

  const currentStep = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS)
  return currentStep + delta
}

// ─── Recovery codes ──────────────────────────────────────────────────────────

// `n` unique, human-formatted single-use recovery codes (e.g.
// `a3kf-9p2m-7xqz-bd4h`). Each carries 80 bits of CSPRNG entropy via
// crypto.randomBytes. Loops until `n` distinct codes are collected (a collision
// across 80-bit codes is astronomically unlikely; the de-dup keeps the contract
// honest). The hyphen grouping is cosmetic — formatRecoveryCode strips it.
export function generateRecoveryCodes(n: number = RECOVERY_CODE_COUNT): string[] {
  const out = new Set<string>()
  while (out.size < n) {
    out.add(randomRecoveryCode())
  }
  return [...out]
}

function randomRecoveryCode(): string {
  const raw = base32Encode(randomBytes(RECOVERY_ENTROPY_BYTES))
  // Group into RECOVERY_GROUP-char blocks for readability.
  const groups: string[] = []
  for (let i = 0; i < raw.length; i += RECOVERY_GROUP) {
    groups.push(raw.slice(i, i + RECOVERY_GROUP))
  }
  return groups.join('-')
}

// Crockford-style base32 of a byte buffer, lowercase, no padding. 10 bytes → 16
// chars. Pure bit-packing; no library dependency.
function base32Encode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return out
}

// Canonical form for comparison: lowercase, separators/whitespace stripped, and
// the Crockford-ambiguous characters folded to their canonical digit (a user who
// reads `O`/`I`/`L` off paper still matches `0`/`1`). A user may type
// `A3KF-9P2M-7XQZ-BD4H`, `a3kf 9p2m 7xqz bd4h`, or run-together — all normalize
// equal to what was hashed at minting.
export function formatRecoveryCode(code: string): string {
  return code
    .toLowerCase()
    .replace(/[oö]/g, '0')
    .replace(/[il]/g, '1')
    .replace(/[^0-9a-z]/g, '')
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
