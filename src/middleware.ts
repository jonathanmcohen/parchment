/**
 * src/middleware.ts — maintenance mode + request-count metrics (I1/I6/§1k/§7m).
 *
 * SECURITY NOTE (§1k): This middleware performs ONLY:
 *   1. Maintenance-mode 503 blocks on non-GET/HEAD API mutations.
 *   2. Request counter increment for Prometheus.
 *
 * It does NOT perform authentication or authorization. Per-route authz
 * (authorizeDocRoute / requireAdmin) remains A's responsibility. A security
 * reviewer should confirm that no auth logic has crept into this file.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { incrementCounter } from '@/lib/metrics'
import { isMaintenanceMode } from '@/lib/maintenance'

// Paths that are always allowed, even in maintenance mode:
//   - Health/readiness probes (must remain reachable for monitoring)
//   - The setup wizard (a fresh install must be able to bootstrap)
const ALWAYS_ALLOWED_PREFIXES = [
  '/api/healthz',
  '/api/readyz',
  '/api/metrics',
  '/setup',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const method = req.method

  // Maintenance mode: block all mutation API routes (non-GET, non-HEAD).
  // Reads (GET/HEAD) are always allowed. Health/setup routes are always allowed.
  const isAlwaysAllowed = ALWAYS_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))
  const isMutation = !['GET', 'HEAD'].includes(method)
  const isApi = pathname.startsWith('/api/')

  if (!isAlwaysAllowed && isMutation && isApi) {
    // isMaintenanceMode() checks the lock file — fast fs.existsSync call.
    if (await isMaintenanceMode()) {
      return NextResponse.json(
        {
          error: 'maintenance',
          message: 'The server is in maintenance mode. Writes are disabled.',
        },
        {
          status: 503,
          headers: { 'Retry-After': '300' },
        },
      )
    }
  }

  // Metrics: increment request counter for every matched route.
  incrementCounter('parchment_request_count')

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/setup/:path*'],
}
