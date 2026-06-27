// §4 — unit tests for the pure fixed-window rate limiter (src/lib/auth/rate-limit.ts).
// `rateLimit` is pure + in-process (no DB), so it is unit-testable directly. The
// `server-only` import resolves to a no-op under vitest (see vitest.config alias).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rateLimit } from '@/lib/auth/rate-limit'

beforeEach(() => {
  // Clear the in-process bucket map so each test starts clean.
  ;(globalThis as unknown as { __authRateLimit?: Map<string, unknown> }).__authRateLimit?.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rateLimit — fixed window', () => {
  it('allows up to `limit` hits then blocks the (limit+1)th', () => {
    const key = 'login:test-ip'
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60).ok).toBe(true)
    }
    const blocked = rateLimit(key, 5, 60)
    expect(blocked.ok).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('reports decreasing `remaining` within the window', () => {
    const key = 'login:remaining'
    expect(rateLimit(key, 3, 60).remaining).toBe(2)
    expect(rateLimit(key, 3, 60).remaining).toBe(1)
    expect(rateLimit(key, 3, 60).remaining).toBe(0)
  })

  it('resets after the window elapses', () => {
    const key = 'login:reset'
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60)
    expect(rateLimit(key, 3, 60).ok).toBe(false)
    // Advance past the 60s window — the bucket expires and the clock restarts.
    vi.advanceTimersByTime(61_000)
    expect(rateLimit(key, 3, 60).ok).toBe(true)
  })

  it('keys are independent — one key tripping does not affect another', () => {
    for (let i = 0; i < 3; i++) rateLimit('login:a', 3, 60)
    expect(rateLimit('login:a', 3, 60).ok).toBe(false)
    expect(rateLimit('login:b', 3, 60).ok).toBe(true)
  })
})
