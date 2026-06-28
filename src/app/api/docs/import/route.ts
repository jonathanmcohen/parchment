// H9 / J7: Import endpoint — POST /api/docs/import
//
// Accepts multipart/form-data with a `file` field. Auth-gated (docs:write).
// J7-1 LOCKED SCOPE: the user-facing import flow accepts MARKDOWN + DOCX ONLY.
// The conversion lib still understands html / notion-zip (kept intact behind the
// `isUserImportType` flag), but this route answers 415 for anything that is not
// md or docx. Detects the file type, converts to ProseMirror JSON via lib/import,
// then creates a new document for the authenticated user.
//
// J7-4: embedded images in a docx are extracted to the J1 asset store and the
// `src` is rewritten to `/api/docs/<id>/assets/<file>` (best-effort; on failure
// the original data URI is kept and a warning is surfaced).
//
// Error handling:
//   401  — not authenticated
//   403  — a docs:read-scoped PAT (cannot write)
//   413  — file exceeds 25 MB
//   415  — unsupported file type (anything not md / docx)
//   200  — { id: string, warnings: string[] }
//
// Malformed-but-detected files are NEVER 500 — they return 200 with warnings
// and a partial document (the FM rule).

import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { createDocument, saveDocument } from '@/lib/docs/repo'
import { detectImportType, importToPmJson, isUserImportType } from '@/lib/import'
import { serializeMarkdown } from '@/lib/markdown/serialize'
import { safeAssetName } from '@/lib/uploads/asset-path'
import { putAsset } from '@/lib/uploads/store'
import { extForMime } from '@/lib/uploads/validate'

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
  // J7-1: gate to md + docx — html / notion-zip / unknown all 415 in the user flow.
  if (!isUserImportType(importType)) {
    return NextResponse.json(
      { error: 'unsupported file type (only .md and .docx)' },
      { status: 415 },
    )
  }

  // J7-4: only docx can carry embedded images. Create the doc FIRST (empty) to mint
  // an id, then run the import with a persist closure bound to that id so extracted
  // assets land under /api/docs/<id>/assets/, then save the final content. For md
  // there are no embedded images, so a single createDocument(content) is enough.
  if (importType === 'docx') {
    let id: string
    try {
      const doc = await createDocument(user.id)
      id = doc.id
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to create document: ${String(err)}` },
        { status: 500 },
      )
    }

    const result = await importToPmJson(importType, bytes, filename, {
      persistImage: async (imgBytes, mime) => {
        try {
          const ext = extForMime(mime)
          if (!ext) return null
          // safeAssetName mints a fresh <uuid>.<ext>; the original name is unused.
          const name = safeAssetName('import', ext)
          await putAsset({ id }, name, imgBytes, mime)
          return `/api/docs/${id}/assets/${name}`
        } catch {
          return null
        }
      },
    })

    try {
      await saveDocument(id, {
        contentJson: result.json,
        markdown: serializeMarkdown(result.json),
        title: result.title,
      })
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to save imported document: ${String(err)}` },
        { status: 500 },
      )
    }
    return NextResponse.json({ id, warnings: result.warnings }, { status: 200 })
  }

  // markdown path — importToPmJson never throws → always returns a result.
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
