import 'server-only'
import { headers } from 'next/headers'

// In-process fixed-window rate limiter. Keyed by an arbitrary string (typically
// "<route>:<client-ip>"). This is a defense-in-depth throttle for the
// second-factor endpoints — it bounds how fast an attacker who already holds a
// valid pending session can submit guesses, independent of the per-session
// failure cap enforced in the DB (see consumePendingFailure in session.ts).
//
// A single self-hosted Parchment node runs one process, so an in-memory store is
// sufficient and avoids a Redis dependency. It is best-effort across HMR/restarts
// (the map resets), which is acceptable for a throttle whose job is to slow, not
// to be a hard ledger — the authoritative attempt cap lives in the DB.

type Bucket = { count: number; resetAt: number }

const globalForRl = globalThis as unknown as { __authRateLimit?: Map<string, Bucket> }
const buckets: Map<string, Bucket> = globalForRl.__authRateLimit ?? new Map()
globalForRl.__authRateLimit = buckets

// Occasionally drop expired buckets so the map cannot grow without bound under a
// distributed-IP flood. Cheap: only sweeps when the map gets large.
function sweep(now: number): void {
  if (buckets.size < 1024) return
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key)
  }
}

export type RateLimitResult = {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
}

// Records one hit against `key` and reports whether it is within `limit` hits
// per `windowSeconds`. The first hit in a window starts the clock; the window
// does NOT slide, so at most `limit` requests are allowed per fixed window.
export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowSeconds * 1000
    buckets.set(key, { count: 1, resetAt })
    return { ok: true, remaining: limit - 1, retryAfterSeconds: windowSeconds }
  }

  existing.count += 1
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfterSeconds }
  }
  return { ok: true, remaining: limit - existing.count, retryAfterSeconds }
}

// Best-effort client IP for rate-limit keying. Behind a reverse proxy the first
// X-Forwarded-For hop is the closest the app can get; it is attacker-spoofable,
// so the IP limiter is only one layer — the per-session DB failure cap is the
// authoritative bound and does not depend on the IP being honest.
export async function clientIp(): Promise<string> {
  // headers() throws if called outside a request scope (e.g. a Server Action invoked
  // in a test harness, or a background job). Best-effort IP is allowed to be unknown,
  // so swallow that and fall back rather than crash the caller — the per-account
  // lockout is the authoritative bound and does not depend on a real IP.
  let h: Headers
  try {
    h = await headers()
  } catch {
    return 'unknown'
  }
  const xff = h.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return h.get('x-real-ip')?.trim() || 'unknown'
}
