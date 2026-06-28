/**
 * GET /api/user/export — GDPR data portability export (I9).
 *
 * Auth: session cookie or PAT Bearer token. Any authenticated user can export
 * their own data. The export contains ONLY that user's data — all DB queries
 * are scoped to `WHERE owner_id = user.id`.
 *
 * Returns a .zip attachment containing:
 *   export-manifest.json, profile.json, documents/{docId}.json
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { buildGdprExport } from '@/lib/export/gdpr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const zipBytes = await buildGdprExport(user.id)
  const dateStamp = new Date().toISOString().slice(0, 10)
  const filename = `parchment-export-${dateStamp}.zip`

  return new Response(zipBytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
