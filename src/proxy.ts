/**
 * src/proxy.ts — maintenance mode + request-count metrics (I1/I6/§1k/§7m).
 *
 * Next 16 renamed the `middleware.ts` file convention to `proxy.ts` (the old
 * name is deprecated). This file is that proxy: it runs before matched routes.
 *
 * SECURITY NOTE (§1k): This proxy performs ONLY:
 *   1. Maintenance-mode 503 blocks on non-GET/HEAD API mutations.
 *   2. Request counter increment for Prometheus.
 *
 * It does NOT perform authentication or authorization. Per-route authz
 * (authorizeDocRoute / requireAdmin) remains A's responsibility. A security
 * reviewer should confirm that no auth logic has crept into this file.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { isMaintenanceMode } from '@/lib/maintenance'
import { incrementCounter } from '@/lib/metrics'

// Paths that are always allowed, even in maintenance mode:
//   - Health/readiness probes (must remain reachable for monitoring)
//   - The setup wizard (a fresh install must be able to bootstrap)
const ALWAYS_ALLOWED_PREFIXES = ['/api/healthz', '/api/readyz', '/api/metrics', '/setup']

export async function proxy(req: NextRequest) {
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

// I6 bugfix root cause: the previous `src/middleware.ts` read the maintenance
// lock-file via `node:fs` (@/lib/maintenance), but Next's *middleware* runtime
// was Edge, where `node:fs` is unavailable → every mutating /api/* request 500'd
// under the prod build (caught by H's e2e; invisible to integration tests that
// call route handlers directly). The Next 16 `proxy` convention ALWAYS runs on
// the Node.js runtime, so the fs-backed maintenance check works natively — no
// `runtime` config is needed (and route-segment config is disallowed here).
export const config = {
  matcher: ['/api/:path*', '/setup/:path*'],
}
