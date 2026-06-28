import 'server-only'

// I4 — S3 (S3-compatible) upload for scheduled workspace backups.
//
// OFF-UNLESS-CONFIGURED (the E9 / Cairn CFG-2 pattern): there is NO enable flag.
// The integration is "on" exactly when all four required env vars are present,
// and a silent no-op otherwise (the scheduler simply never registers the job).
//
// Required env (all four must be set for isS3Configured() to be true):
//   BACKUP_S3_ENDPOINT          — S3-compatible endpoint URL (MinIO / R2 / AWS)
//   BACKUP_S3_BUCKET            — target bucket name
//   BACKUP_S3_ACCESS_KEY_ID    — access key id
//   BACKUP_S3_SECRET_ACCESS_KEY — secret access key (NEVER logged)
// Optional:
//   BACKUP_S3_REGION           — region (default 'us-east-1')
//
// The @aws-sdk/client-s3 dependency is DYNAMIC-IMPORTED inside uploadToS3 only,
// so the default server bundle — and every unconfigured install — never loads
// the SDK.

/** True only when all four required BACKUP_S3_* env vars are set (non-empty). */
export function isS3Configured(): boolean {
  return Boolean(
    process.env.BACKUP_S3_ENDPOINT &&
      process.env.BACKUP_S3_BUCKET &&
      process.env.BACKUP_S3_ACCESS_KEY_ID &&
      process.env.BACKUP_S3_SECRET_ACCESS_KEY,
  )
}

/**
 * Upload `body` to the configured S3-compatible bucket under `key`.
 *
 * Dynamic-imports @aws-sdk/client-s3 so the SDK stays out of the default bundle.
 * Builds an S3Client with forcePathStyle: true (MinIO / R2 compatible) and the
 * credentials from env. THROWS on failure so the caller (the scheduler job)
 * records the error; the secret is never logged.
 */
export async function uploadToS3(
  key: string,
  body: Uint8Array,
  contentType = 'application/zip',
): Promise<void> {
  const endpoint = process.env.BACKUP_S3_ENDPOINT
  const bucket = process.env.BACKUP_S3_BUCKET
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3 is not configured (missing BACKUP_S3_* env vars).')
  }
  const region = process.env.BACKUP_S3_REGION || 'us-east-1'

  // Dynamic import keeps @aws-sdk/client-s3 out of the default bundle.
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

/**
 * Fetch the object at `key` from the configured S3-compatible bucket. Returns the
 * body as a Uint8Array, or null when the object does not exist (NoSuchKey / 404) or
 * S3 is unconfigured. Other transport errors propagate (the caller decides). Used by
 * the J1 asset adapter to read attachments stored under the `assets/` key prefix.
 *
 * Dynamic-imports @aws-sdk/client-s3 so the SDK stays out of the default bundle.
 */
export async function getObjectFromS3(key: string): Promise<Uint8Array | null> {
  const endpoint = process.env.BACKUP_S3_ENDPOINT
  const bucket = process.env.BACKUP_S3_BUCKET
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null
  const region = process.env.BACKUP_S3_REGION || 'us-east-1'

  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })

  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const body = res.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined
    if (!body?.transformToByteArray) return null
    return await body.transformToByteArray()
  } catch (err) {
    // A missing object is a normal "not found", not an error to surface.
    const name = (err as { name?: string })?.name ?? ''
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
    if (name === 'NoSuchKey' || name === 'NotFound' || status === 404) return null
    throw err
  }
}
