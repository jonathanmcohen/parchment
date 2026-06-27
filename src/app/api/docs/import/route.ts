// H9: Import endpoint — POST /api/docs/import
//
// Accepts multipart/form-data with a `file` field. Auth-gated.
// Detects the file type, converts to ProseMirror JSON via the lib/import
// pipeline, then creates a new document for the authenticated user.
//
// Error handling:
//   401  — not authenticated
//   413  — file exceeds 25 MB
//   415  — unsupported / unknown file type
//   200  — { id: string, warnings: string[] }
//
// Malformed-but-detected files are NEVER 500 — they return 200 with warnings
// and a partial document (the FM rule).

import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { createDocument } from '@/lib/docs/repo'
import { detectImportType, importToPmJson } from '@/lib/import'

// jsdom and mammoth require the Node.js runtime — not edge-compatible.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  // Check Content-Length before buffering the body to avoid accepting arbitrarily
  // large payloads. Next.js App Router route handlers have no automatic body-size
  // limit (serverActions.bodySizeLimit applies only to Server Actions).
  const contentLength = req.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 25 MB)' }, { status: 413 })
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
    return NextResponse.json({ error: 'file too large (max 25 MB)' }, { status: 413 })
  }

  const arrayBuffer = await fileField.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const filename = fileField.name || 'imported'

  const importType = detectImportType(filename, bytes)
  if (importType === 'unknown') {
    return NextResponse.json({ error: 'unsupported file type' }, { status: 415 })
  }

  // importToPmJson never throws — always returns a result (possibly with warnings)
  const result = await importToPmJson(importType, bytes, filename)

  let id: string
  try {
    const doc = await createDocument(user.id, {
      title: result.title,
      content: result.json,
    })
    id = doc.id
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to create document: ${String(err)}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ id, warnings: result.warnings }, { status: 200 })
}
