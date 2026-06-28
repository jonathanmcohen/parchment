import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { resolveS3Config, type S3Config, testS3Connection } from '@/lib/backup/s3-config'
import { SECRET_MASK } from '@/lib/crypto/secret-box'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/settings/backup/s3/test — HeadBucket against the submitted (unsaved)
 * config. Admin-only. If `secretAccessKey === SECRET_MASK` (or absent), the
 * stored secret is used. Returns { ok: true } | { ok: false, error } — never a
 * 500 for a connection failure, and never echoes the secret.
 */
export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  // Stored config supplies any field the request omits (e.g. a masked secret).
  const stored = await resolveS3Config()

  const endpoint =
    typeof body.endpoint === 'string' ? body.endpoint.trim() : (stored?.endpoint ?? '')
  const bucket = typeof body.bucket === 'string' ? body.bucket.trim() : (stored?.bucket ?? '')
  const accessKeyId =
    typeof body.accessKeyId === 'string' ? body.accessKeyId.trim() : (stored?.accessKeyId ?? '')
  const region =
    typeof body.region === 'string' ? body.region.trim() : (stored?.region ?? 'us-east-1')

  let secretAccessKey = stored?.secretAccessKey ?? ''
  if (
    typeof body.secretAccessKey === 'string' &&
    body.secretAccessKey !== SECRET_MASK &&
    body.secretAccessKey !== ''
  ) {
    secretAccessKey = body.secretAccessKey
  }

  if (!endpoint || !bucket) {
    return NextResponse.json({ ok: false, error: 'endpoint and bucket are required' })
  }

  const cfg: S3Config = {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
    prefix: stored?.prefix ?? '',
    scheduleHours: stored?.scheduleHours ?? 24,
    enabled: true,
  }

  const result = await testS3Connection(cfg)
  return NextResponse.json(result)
}
