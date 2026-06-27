// I4 — POST /api/backup/restore → recreate docs from an uploaded backup .zip.
//
// Auth-gated, multipart/form-data with a `file` field. Resilient: per-doc
// failures become skips + warnings (never a 500). A fundamentally invalid backup
// (not a zip / no manifest) → 400 with the message. nodejs runtime.

import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { restoreWorkspaceBackup } from '@/lib/backup/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 100 * 1024 * 1024 // 100 MB (matches the H9 total-size cap)

export async function POST(req: NextRequest) {
  // J8 §7i: restore is a workspace-mutating write — a docs:read PAT CANNOT restore.
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  // Reject obviously-too-large payloads before buffering the body.
  const contentLength = req.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 100 MB)' }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 })
  }

  const fileField = formData.get('file')
  if (!(fileField instanceof File)) {
    return NextResponse.json({ error: 'missing file field' }, { status: 400 })
  }
  if (fileField.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 100 MB)' }, { status: 413 })
  }

  const bytes = new Uint8Array(await fileField.arrayBuffer())

  let result: Awaited<ReturnType<typeof restoreWorkspaceBackup>>
  try {
    result = await restoreWorkspaceBackup(user.id, bytes)
  } catch (err) {
    // parseWorkspaceBackup throws only for a fundamentally invalid backup.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'invalid backup file' },
      { status: 400 },
    )
  }

  return NextResponse.json(result, { status: 200 })
}
