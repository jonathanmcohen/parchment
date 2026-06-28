/**
 * GET /api/readyz — readiness probe (I1/§7k).
 *
 * Requires DB connectivity. Returns 200 when the database probe is 'up';
 * returns 503 otherwise. Collab probe is advisory: it is included in the body
 * but does NOT flip the HTTP status (collab may be unavailable in maintenance
 * windows). This is separate from /api/healthz (C's liveness probe) — do NOT
 * modify that route.
 *
 * Used by:
 *   • docker-compose healthcheck (sequenced after C's /api/healthz healthcheck)
 *   • Kubernetes readinessProbe
 *   • Load-balancer health gates
 */

import { probeCollab, probeDatabase } from '@/lib/health/probes'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [db, collab] = await Promise.all([probeDatabase(), probeCollab()])
  const ok = db.status === 'up'

  return Response.json(
    {
      ok,
      checks: {
        db: db.status,
        collab: collab.status,
      },
    },
    { status: ok ? 200 : 503 },
  )
}
