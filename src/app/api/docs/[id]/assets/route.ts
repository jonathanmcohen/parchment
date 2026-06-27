import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { authenticateRequest } from '@/lib/auth/guard'
import { listDocuments } from '@/lib/docs/repo'
import { getDocument } from '@/lib/docs/repo'
import { env } from '@/lib/env'
import { checkQuota, getUsedAssetBytes } from '@/lib/quota'

export const dynamic = 'force-dynamic'

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
])

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

const EXT_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

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

  const contentType = file.type
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: 'unsupported_type', allowed: [...ALLOWED_TYPES] },
      { status: 400 },
    )
  }

  const bytes = await file.arrayBuffer()
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large', maxBytes: MAX_BYTES }, { status: 400 })
  }

  // I2: quota enforcement (§7v — use userRow, never shadow the `user` variable).
  // Fetch the DB row to get quotaMb; 0 = unlimited.
  const [userRow] = await db
    .select({ quotaMb: schema.users.quotaMb })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1)

  if (userRow && userRow.quotaMb > 0) {
    // Measure all asset bytes for this user's docs.
    const docs = await listDocuments(user.id)
    const docIds = docs.map((d) => d.id)
    const assetsRoot = join(env.filesRoot, '.assets')
    const usedBytes = await getUsedAssetBytes(docIds, assetsRoot)

    if (!checkQuota({ quotaMb: userRow.quotaMb, usedBytes, fileBytes: bytes.byteLength })) {
      return NextResponse.json(
        {
          error: 'quota_exceeded',
          usedMb: usedBytes / (1024 * 1024),
          quotaMb: userRow.quotaMb,
        },
        { status: 413 },
      )
    }
  }

  const ext = EXT_MAP[contentType] ?? (extname(file.name).replace(/^\./, '') || 'bin')
  const filename = `${randomUUID()}.${ext}`
  const dir = `${env.filesRoot}/.assets/${id}`
  const filepath = `${dir}/${filename}`

  await mkdir(dir, { recursive: true })
  await writeFile(filepath, Buffer.from(bytes))

  return NextResponse.json({ url: `/api/docs/${id}/assets/${filename}` }, { status: 201 })
}
