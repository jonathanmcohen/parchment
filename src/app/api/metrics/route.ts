/**
 * GET /api/metrics — Prometheus scrape endpoint (I1/§7v).
 *
 * Auth (default-deny when METRICS_TOKEN is empty):
 *   • Non-empty Bearer token matching env.metricsToken → authorized
 *   • Active admin session → authorized
 *   • Anything else → 403 (never open to the public)
 *
 * Returns Prometheus text format (text/plain; version=0.0.4).
 */

import type { NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { checkMetricsAuth } from '@/lib/metrics-auth'
import { serializePrometheus } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authorized = await checkMetricsAuth(
    req.headers.get('Authorization'),
    req.headers.get('Cookie'),
    env.metricsToken,
  )

  if (!authorized) {
    return new Response('Forbidden', { status: 403 })
  }

  return new Response(serializePrometheus(), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4',
      'Cache-Control': 'no-store',
    },
  })
}
