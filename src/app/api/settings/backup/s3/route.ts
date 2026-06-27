import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { resolveS3Config, type S3Config, saveS3Config } from '@/lib/backup/s3-config'
import { SECRET_MASK } from '@/lib/crypto/secret-box'
import { scheduler } from '@/lib/schedules/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/settings/backup/s3 — current S3 config. Admin-only. The secret access
 * key is masked (SECRET_MASK) when set, null when unset — the plaintext is NEVER
 * returned.
 */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const cfg = await resolveS3Config()
  return NextResponse.json({
    endpoint: cfg?.endpoint ?? '',
    bucket: cfg?.bucket ?? '',
    region: cfg?.region ?? 'us-east-1',
    prefix: cfg?.prefix ?? '',
    scheduleHours: cfg?.scheduleHours ?? 24,
    enabled: cfg?.enabled ?? false,
    // Masked when a secret is stored; null otherwise.
    secretAccessKey: cfg?.secretAccessKey ? SECRET_MASK : null,
    accessKeyId: cfg?.accessKeyId ?? '',
  })
}

/**
 * PUT /api/settings/backup/s3 — save config + live re-register the s3-backup job.
 * Admin-only.
 *
 * - When `enabled` is true, `endpoint` + `bucket` are required (400 otherwise).
 * - `enabled: false` disables without requiring any secrets.
 * - A submitted `secretAccessKey === SECRET_MASK` is dropped so the stored secret
 *   is never overwritten by the mask.
 */
export async function PUT(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const enabled = Boolean(body.enabled)

  // When enabling, endpoint + bucket are mandatory.
  if (enabled) {
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
    const bucket = typeof body.bucket === 'string' ? body.bucket.trim() : ''
    if (!endpoint || !bucket) {
      return NextResponse.json({ error: 'endpoint and bucket are required' }, { status: 400 })
    }
  }

  const scheduleHoursRaw = Number(body.scheduleHours)
  const patch: Partial<S3Config> & { secretAccessKey?: string } = {
    enabled,
    ...(typeof body.endpoint === 'string' ? { endpoint: body.endpoint.trim() } : {}),
    ...(typeof body.bucket === 'string' ? { bucket: body.bucket.trim() } : {}),
    ...(typeof body.accessKeyId === 'string' ? { accessKeyId: body.accessKeyId.trim() } : {}),
    ...(typeof body.region === 'string' ? { region: body.region.trim() } : {}),
    ...(typeof body.prefix === 'string' ? { prefix: body.prefix } : {}),
    ...(Number.isFinite(scheduleHoursRaw) && scheduleHoursRaw > 0
      ? { scheduleHours: Math.floor(scheduleHoursRaw) }
      : {}),
  }
  // Only forward a REAL secret — never the mask (which would clobber the stored one).
  if (typeof body.secretAccessKey === 'string' && body.secretAccessKey !== SECRET_MASK) {
    patch.secretAccessKey = body.secretAccessKey
  }

  await saveS3Config(patch)
  scheduler.reconfigureS3Job(enabled)
  return NextResponse.json({ ok: true })
}
