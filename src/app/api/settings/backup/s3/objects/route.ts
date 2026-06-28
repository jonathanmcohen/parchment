import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { resolveS3Config } from '@/lib/backup/s3-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/settings/backup/s3/objects — list backup objects (max 100) under the
 * configured prefix, for the restore picker. Admin-only. Paginated via the
 * `continuationToken` query param. Dynamic-imports the AWS SDK so it stays out of
 * the default bundle. Never leaks the secret in an error.
 */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const cfg = await resolveS3Config()
  if (!cfg) return NextResponse.json({ error: 's3_not_configured' }, { status: 400 })

  const continuationToken = req.nextUrl.searchParams.get('continuationToken') ?? undefined

  try {
    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3')
    const client = new S3Client({
      region: cfg.region || 'us-east-1',
      endpoint: cfg.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    })
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        ...(cfg.prefix ? { Prefix: cfg.prefix } : {}),
        MaxKeys: 100,
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      }),
    )
    const objects = (out.Contents ?? [])
      .filter((o) => typeof o.Key === 'string')
      .map((o) => ({
        key: o.Key as string,
        lastModified: o.LastModified ? o.LastModified.toISOString() : null,
        size: o.Size ?? 0,
      }))
    return NextResponse.json({
      objects,
      nextContinuationToken: out.IsTruncated ? (out.NextContinuationToken ?? null) : null,
    })
  } catch (err) {
    const msg = sanitize(err, cfg.secretAccessKey)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

function sanitize(err: unknown, secret: string): string {
  let msg = err instanceof Error ? err.message : String(err)
  if (secret && msg.includes(secret)) msg = msg.split(secret).join('***')
  return msg
}
