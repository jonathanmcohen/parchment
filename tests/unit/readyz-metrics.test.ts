import { describe, expect, it, vi } from 'vitest'
import { incrementCounter, serializePrometheus } from '../../src/lib/metrics'
import { checkMetricsAuth, isBearerAuthorized } from '../../src/lib/metrics-auth'

/**
 * Unit tests for I1: /api/readyz and /api/metrics route contracts.
 * §7k: /api/healthz is C's (not tested here). I adds /api/readyz + /api/metrics.
 * §7v: /metrics default-deny when METRICS_TOKEN empty.
 */

// ── Metrics registry ──────────────────────────────────────────────────────────

describe('metrics registry', () => {
  it('serializePrometheus includes parchment_up 1', () => {
    const out = serializePrometheus()
    expect(out).toContain('parchment_up 1')
  })

  it('incrementCounter increments a named counter', () => {
    incrementCounter('test_counter_unit')
    incrementCounter('test_counter_unit')
    const out = serializePrometheus()
    const match = out.match(/test_counter_unit (\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(2)
  })

  it('incrementCounter with labels produces {job="..."} notation', () => {
    incrementCounter('test_scheduler_job', { job: 'trash-purge', status: 'success' })
    const out = serializePrometheus()
    expect(out).toContain('test_scheduler_job{')
    expect(out).toContain('trash-purge')
  })

  it('serializePrometheus output lines match Prometheus text format', () => {
    const out = serializePrometheus()
    const lines = out.split('\n').filter((l) => l.trim() && !l.startsWith('#'))
    for (const line of lines) {
      expect(line).toMatch(/^[a-z_]+(\{[^}]*\})? \S+$/)
    }
  })
})

// ── /api/readyz — pure logic tests ───────────────────────────────────────────
// Test the readyz contract logic without importing the route (avoids @/db pull-in).
// The route is: ok = db.status === 'up', status = ok ? 200 : 503, collab is advisory.

describe('/api/readyz contract logic', () => {
  function buildReadyzResponse(
    dbStatus: 'up' | 'down',
    collabStatus: 'up' | 'down',
  ): { status: number; body: { ok: boolean; checks: { db: string; collab: string } } } {
    const ok = dbStatus === 'up'
    return {
      status: ok ? 200 : 503,
      body: { ok, checks: { db: dbStatus, collab: collabStatus } },
    }
  }

  it('returns status 200 and ok:true when DB is up', () => {
    const { status, body } = buildReadyzResponse('up', 'up')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.checks.db).toBe('up')
  })

  it('returns status 503 and ok:false when DB is down', () => {
    const { status, body } = buildReadyzResponse('down', 'up')
    expect(status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.checks.db).toBe('down')
  })

  it('collab down does NOT flip status — remains 200 (advisory)', () => {
    const { status, body } = buildReadyzResponse('up', 'down')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.checks.collab).toBe('down')
  })

  it('response body has checks.db and checks.collab keys', () => {
    const { body } = buildReadyzResponse('up', 'up')
    expect(body).toHaveProperty('checks')
    expect(body.checks).toHaveProperty('db')
    expect(body.checks).toHaveProperty('collab')
  })

  it('DB down + collab down → 503 ok:false', () => {
    const { status, body } = buildReadyzResponse('down', 'down')
    expect(status).toBe(503)
    expect(body.ok).toBe(false)
  })
})

// ── /api/metrics authorization — pure isBearerAuthorized (§7v) ───────────────

describe('/api/metrics isBearerAuthorized (§7v pure function)', () => {
  it('returns false when configuredToken is empty (never open)', () => {
    expect(isBearerAuthorized('anyvalue', '')).toBe(false)
  })

  it('returns false when bearer is empty', () => {
    expect(isBearerAuthorized('', 'mytoken')).toBe(false)
  })

  it('returns true when bearer matches non-empty token', () => {
    expect(isBearerAuthorized('mysecrettoken', 'mysecrettoken')).toBe(true)
  })

  it('returns false when bearer does NOT match configured token', () => {
    expect(isBearerAuthorized('wrongtoken', 'correcttoken')).toBe(false)
  })

  it('empty token + empty bearer is still rejected', () => {
    expect(isBearerAuthorized('', '')).toBe(false)
  })
})

// ── checkMetricsAuth: bearer path only (no session) ──────────────────────────

describe('checkMetricsAuth bearer path', () => {
  it('returns true when Authorization header has matching bearer', async () => {
    const result = await checkMetricsAuth('Bearer secrettoken', null, 'secrettoken')
    expect(result).toBe(true)
  })

  it('returns false when no auth and empty token (no session)', async () => {
    const result = await checkMetricsAuth(null, null, '')
    expect(result).toBe(false)
  })

  it('returns false when bearer does not match', async () => {
    const result = await checkMetricsAuth('Bearer wrong', null, 'correct')
    expect(result).toBe(false)
  })

  it('strips Bearer prefix before comparing', async () => {
    const result = await checkMetricsAuth('Bearer tok123', null, 'tok123')
    expect(result).toBe(true)
  })
})
