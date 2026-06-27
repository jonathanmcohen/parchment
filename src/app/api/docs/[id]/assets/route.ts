import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { authorizeDocRoute } from '@/lib/authz/doc-access'
import { listDocuments } from '@/lib/docs/repo'
import { env } from '@/lib/env'
import { checkQuota, getUsedAssetBytes } from '@/lib/quota'
import { safeAssetName } from '@/lib/uploads/asset-path'
import { putAsset } from '@/lib/uploads/store'
import { ALLOWED_UPLOAD_TYPES, classifyUpload } from '@/lib/uploads/validate'

// J1-4: upload an attachment (image OR file) for a doc. Storage dispatches disk vs
// S3 via the shared adapter (lib/uploads/store). Validation is the pure validator
// (magic-byte sniff, SVG-script rejection, size caps). Authorization is the canonical
// authz module — `edit` covers the owner AND a shared-editor grant; a non-owner /
// shared-viewer / stranger gets 404 (no existence oracle).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const errStatus: Record<string, number> = {
  empty: 400,
  unsupported_type: 400,
  content_mismatch: 400,
  unsafe_svg: 400,
  too_large: 413,
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await ctx.params
  // `edit` = owner OR shared-editor grant; denied/missing → 404 (no existence leak).
  const access = await authorizeDocRoute(user, id, 'edit')
  if (!access.ok) return NextResponse.json({ error: 'not_found' }, { status: access.status })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const result = classifyUpload({ name: file.name, type: file.type, size: file.size }, bytes)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, allowed: ALLOWED_UPLOAD_TYPES },
      { status: errStatus[result.error] ?? 400 },
    )
  }

  // I2: per-user storage quota. 0 = unlimited.
  const [userRow] = await db
    .select({ quotaMb: schema.users.quotaMb })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1)

  if (userRow && userRow.quotaMb > 0) {
    const docs = await listDocuments(user.id)
    const docIds = docs.map((d) => d.id)
    const assetsRoot = `${env.filesRoot}/.assets`
    const usedBytes = await getUsedAssetBytes(docIds, assetsRoot)
    if (!checkQuota({ quotaMb: userRow.quotaMb, usedBytes, fileBytes: bytes.byteLength })) {
      return NextResponse.json(
        { error: 'quota_exceeded', usedMb: usedBytes / (1024 * 1024), quotaMb: userRow.quotaMb },
        { status: 413 },
      )
    }
  }

  const name = safeAssetName(file.name, result.ext)
  await putAsset({ id }, name, bytes, result.contentType)

  return NextResponse.json(
    { url: `/api/docs/${id}/assets/${name}`, kind: result.kind },
    { status: 201 },
  )
}
