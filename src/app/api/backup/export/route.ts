// I4 — GET /api/backup/export → stream a lossless workspace backup .zip.
//
// Auth-gated. Builds a single zip of the authenticated user's whole workspace
// (raw ProseMirror JSON per doc) and streams it as an attachment. nodejs runtime
// (jszip + the backup service touch @/db / Node APIs).

import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { createWorkspaceBackup } from '@/lib/backup/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A filesystem-safe date stamp (YYYY-MM-DD) for the download filename. */
function dateStamp(iso: string): string {
  return iso.slice(0, 10)
}

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const createdAt = new Date().toISOString()
  const zipBytes = await createWorkspaceBackup(user.id, createdAt)
  const filename = `parchment-backup-${dateStamp(createdAt)}.zip`

  // zipBytes is Uint8Array — a valid BodyInit at runtime; cast satisfies strict TS.
  return new Response(zipBytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
