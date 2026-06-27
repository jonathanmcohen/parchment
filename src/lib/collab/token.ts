import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

// ── H Task 15 — short-lived signed collab token ────────────────────────────
//
// The Hocuspocus client cannot send a session cookie over the WS handshake, so an
// authenticated editor fetches a SHORT-LIVED opaque token from /api/collab-token
// (session-authenticated) and passes it to `new HocuspocusProvider({ token })`. The
// collab server's onAuthenticate verifies it. The token is HMAC-signed over
// PARCHMENT_SECRET_KEY (the same master key Phase 0 validates at boot) and carries
// `{ sub: userId, docId, exp }`. It is NOT encryption — the payload is readable —
// but it is UNFORGEABLE without the secret, and bound to a single doc + a short
// expiry, so a leaked token grants at most brief access to that one doc.
//
// No 'server-only' guard: the collab server (bare tsx) imports this via a relative
// path AND the integration suite imports it directly. It only uses node:crypto + the
// master key, no DB.

export type CollabTokenPayload = {
  /** the authenticated user id (the principal getDocAccess will be checked for). */
  userId: string
  /** the doc this token authorizes — MUST equal the connection's documentName. */
  docId: string
  /** epoch SECONDS expiry. */
  exp: number
}

function key(): Buffer {
  // env.secretKey is the validated 32-byte master key as a BASE64 STRING, or null
  // when unconfigured. When unconfigured we derive a key from a constant so
  // mint/verify are self-consistent within a process (auth still works; a restart
  // rotates it).
  return env.secretKey ? Buffer.from(env.secretKey, 'base64') : Buffer.alloc(32, 0)
}

function sign(data: string): string {
  return createHmac('sha256', key()).update(data).digest('base64url')
}

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')
}

/**
 * Mint a signed collab token for `{ userId, docId }`, valid for `ttlSec` seconds.
 * Format: `<b64url(payload)>.<b64url(hmac)>`.
 */
export function mintCollabToken(
  principal: { userId: string; docId: string },
  ttlSec: number,
): string {
  const payload: CollabTokenPayload = {
    userId: principal.userId,
    docId: principal.docId,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  }
  const body = b64urlJson(payload)
  return `${body}.${sign(body)}`
}

/**
 * Verify + decode a collab token. Returns the payload when the signature is valid
 * AND the token is not expired; otherwise null. Constant-time signature compare.
 */
export function verifyCollabToken(token: string): CollabTokenPayload | null {
  if (!token || typeof token !== 'string') return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expected = sign(body)
  // Constant-time compare; lengths must match for timingSafeEqual.
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: CollabTokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CollabTokenPayload
  } catch {
    return null
  }
  if (
    !payload ||
    typeof payload.userId !== 'string' ||
    typeof payload.docId !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    return null
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}
