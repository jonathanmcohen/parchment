// I4 — GET /api/backup/export → stream a lossless workspace backup .zip.
//
// Auth-gated. Builds a single zip of the authenticated user's whole workspace
// (raw ProseMirror JSON per doc) and streams it as an attachment. nodejs runtime
// (jszip + the backup service touch @/db / Node APIs).

import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { createWorkspaceBackup } from '@/lib/backup/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A filesystem-safe date stamp (YYYY-MM-DD) for the download filename. */
function dateStamp(iso: string): string {
  return iso.slice(0, 10)
}

export async function GET(req: NextRequest) {
  // J8 §7i: self-service export is read-only → requires docs:read.
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

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
