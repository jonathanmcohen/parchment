import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { resolveS3Config } from '@/lib/backup/s3-config'
import {
  restoreWorkspaceBackup,
  restoreWorkspaceBackupSelective,
  type SelectiveRestoreFilter,
} from '@/lib/backup/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/settings/backup/s3/restore { key, filter? }
 *
 * Admin-only. Fetches the backup object from the configured bucket and restores
 * its documents. An optional `filter` (docTitles / folderPrefixes) selects which
 * docs to restore (D2 selective restore); absent → full restore.
 *
 * - Path-traversal guard: a key containing `..` or starting with `/` → 400.
 * - S3 fetch failure → 502 with a sanitized error (never echoes the secret).
 * - The AWS SDK is dynamic-imported so it stays out of the default bundle.
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

  const key = typeof body.key === 'string' ? body.key : ''
  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 })
  // Path-traversal guard (mirrors safeEntryName): reject `..` segments + absolute keys.
  if (key.startsWith('/') || key.startsWith('\\') || key.split(/[/\\]/).includes('..')) {
    return NextResponse.json({ error: 'invalid key' }, { status: 400 })
  }

  const cfg = await resolveS3Config()
  if (!cfg) return NextResponse.json({ error: 's3_not_configured' }, { status: 400 })

  let bytes: Uint8Array
  try {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
    const client = new S3Client({
      region: cfg.region || 'us-east-1',
      endpoint: cfg.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    })
    const out = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }))
    const bodyStream = out.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined
    if (!bodyStream?.transformToByteArray) {
      return NextResponse.json({ error: 'empty S3 object' }, { status: 502 })
    }
    bytes = await bodyStream.transformToByteArray()
  } catch (err) {
    const msg = sanitize(err, cfg.secretAccessKey)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const filter = parseFilter(body.filter)

  try {
    const result = filter
      ? await restoreWorkspaceBackupSelective(user.id, bytes, filter)
      : await restoreWorkspaceBackup(user.id, bytes)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    // A fundamentally invalid backup (not a zip / no manifest) → 400.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'invalid backup file' },
      { status: 400 },
    )
  }
}

/** Parse an optional selective-restore filter from the request body. */
function parseFilter(raw: unknown): SelectiveRestoreFilter | null {
  if (typeof raw !== 'object' || raw === null) return null
  const f = raw as Record<string, unknown>
  const folderPrefixes = Array.isArray(f.folderPrefixes)
    ? f.folderPrefixes.filter((p): p is string => typeof p === 'string')
    : undefined
  const docTitles = Array.isArray(f.docTitles)
    ? f.docTitles.filter((t): t is string => typeof t === 'string')
    : undefined
  if (!folderPrefixes && !docTitles) return null
  return { ...(folderPrefixes ? { folderPrefixes } : {}), ...(docTitles ? { docTitles } : {}) }
}

function sanitize(err: unknown, secret: string): string {
  let msg = err instanceof Error ? err.message : String(err)
  if (secret && msg.includes(secret)) msg = msg.split(secret).join('***')
  return msg
}
