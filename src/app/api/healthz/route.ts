import { NextResponse } from 'next/server'

/**
 * GET /api/healthz — liveness probe (owned by Group C; §7k).
 * Returns 200 {"status":"ok"} as long as the Next.js app is running.
 *
 * This is intentionally minimal: no DB ping, no build hash, no memory check.
 * Group I adds those checks in a SEPARATE /api/readyz endpoint.
 * This file must NOT be modified by Group I.
 */
export function GET() {
  return NextResponse.json({ status: 'ok' })
}
