import 'server-only'

// F1 — S3 backup configuration: env > DB precedence, encrypted DB storage, and a
// HeadBucket connection test. The four secrets (endpoint/bucket/accessKeyId/
// secretAccessKey) live encrypted in app_config when set via the UI; the
// BACKUP_S3_* env vars take precedence when present (env wins for the secrets,
// while prefix/scheduleHours/enabled can still come from DB).
//
// The @aws-sdk/client-s3 dependency is DYNAMIC-IMPORTED inside testS3Connection
// only, so the default server bundle never loads the SDK for an unconfigured
// install. The secret access key is NEVER logged or returned in an error string.

import {
  deleteAppConfig,
  getAppConfig,
  getAppConfigJson,
  setAppConfig,
  setAppConfigJson,
} from '@/lib/config/repo'

export interface S3Config {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  prefix: string
  scheduleHours: number
  enabled: boolean
}

const DEFAULT_REGION = 'us-east-1'
const DEFAULT_SCHEDULE_HOURS = 24

/** True iff all four required secret env vars are present (non-empty). */
function envSecretsPresent(): boolean {
  return Boolean(
    process.env.BACKUP_S3_ENDPOINT &&
      process.env.BACKUP_S3_BUCKET &&
      process.env.BACKUP_S3_ACCESS_KEY_ID &&
      process.env.BACKUP_S3_SECRET_ACCESS_KEY,
  )
}

/**
 * Resolve the active S3 config, or null if S3 is not configured.
 *
 * Precedence: if all four BACKUP_S3_* env vars are present, env wins for the
 * secrets and the config is always active (enabled). prefix/scheduleHours can
 * still be read from DB so an operator can tune them in the UI.
 *
 * If env is absent, the config is read from app_config (encrypted). It is only
 * returned when all four DB secrets are present AND s3.enabled is true.
 */
export async function resolveS3Config(): Promise<S3Config | null> {
  // Non-secret tunables (shared between env + DB modes).
  const prefix = (await getAppConfig('s3.prefix')) ?? ''
  const scheduleHours =
    (await getAppConfigJson<number>('s3.scheduleHours')) ?? DEFAULT_SCHEDULE_HOURS

  if (envSecretsPresent()) {
    return {
      endpoint: process.env.BACKUP_S3_ENDPOINT ?? '',
      bucket: process.env.BACKUP_S3_BUCKET ?? '',
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? '',
      region: process.env.BACKUP_S3_REGION || DEFAULT_REGION,
      prefix,
      scheduleHours,
      // Env-configured S3 is always active (matches isS3Configured's contract).
      enabled: true,
    }
  }

  // DB mode: require all four secrets AND the enabled flag.
  const enabled = (await getAppConfigJson<boolean>('s3.enabled')) ?? false
  if (!enabled) return null

  const endpoint = await getAppConfig('s3.endpoint')
  const bucket = await getAppConfig('s3.bucket')
  const accessKeyId = await getAppConfig('s3.accessKeyId')
  const secretAccessKey = await getAppConfig('s3.secretAccessKey')
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null

  const region = (await getAppConfig('s3.region')) || DEFAULT_REGION
  return { endpoint, bucket, accessKeyId, secretAccessKey, region, prefix, scheduleHours, enabled }
}

/**
 * Persist S3 config to app_config (each value encrypted at rest).
 *
 * - secretAccessKey is written ONLY when provided (non-undefined, non-empty),
 *   so the masked placeholder from the UI never overwrites a stored secret.
 * - enabled/scheduleHours are stored as JSON; the rest as encrypted strings.
 */
export async function saveS3Config(
  cfg: Partial<S3Config> & { secretAccessKey?: string },
): Promise<void> {
  if (cfg.endpoint !== undefined) await setAppConfig('s3.endpoint', cfg.endpoint)
  if (cfg.bucket !== undefined) await setAppConfig('s3.bucket', cfg.bucket)
  if (cfg.accessKeyId !== undefined) await setAppConfig('s3.accessKeyId', cfg.accessKeyId)
  // Secret: write only when a real value is supplied (never the mask / empty).
  if (cfg.secretAccessKey !== undefined && cfg.secretAccessKey !== '') {
    await setAppConfig('s3.secretAccessKey', cfg.secretAccessKey)
  }
  if (cfg.region !== undefined) await setAppConfig('s3.region', cfg.region)
  if (cfg.prefix !== undefined) await setAppConfig('s3.prefix', cfg.prefix)
  if (cfg.scheduleHours !== undefined) await setAppConfigJson('s3.scheduleHours', cfg.scheduleHours)
  if (cfg.enabled !== undefined) await setAppConfigJson('s3.enabled', cfg.enabled)
}

/** Remove every stored S3 config key (a full reset). */
export async function clearS3Config(): Promise<void> {
  for (const key of [
    's3.endpoint',
    's3.bucket',
    's3.accessKeyId',
    's3.secretAccessKey',
    's3.region',
    's3.prefix',
    's3.scheduleHours',
    's3.enabled',
  ]) {
    await deleteAppConfig(key)
  }
}

/**
 * True if S3 is active via EITHER env OR DB config. The scheduler uses this
 * (async) so the existing sync `isS3Configured()` (env-only) call-sites are not
 * broken.
 */
export async function isS3Active(): Promise<boolean> {
  return (await resolveS3Config()) !== null
}

/**
 * Test a HeadBucket against the given config. Dynamic-imports the AWS SDK so it
 * stays out of the default bundle. Returns a sanitized error — NEVER echoes the
 * secret access key.
 */
export async function testS3Connection(
  cfg: S3Config,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3')
    const client = new S3Client({
      region: cfg.region || DEFAULT_REGION,
      endpoint: cfg.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    })
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: sanitizeS3Error(err, cfg) }
  }
}

/** Strip the secret key out of any error message before surfacing it. */
function sanitizeS3Error(err: unknown, cfg: S3Config): string {
  let msg = err instanceof Error ? err.message : String(err)
  if (cfg.secretAccessKey && msg.includes(cfg.secretAccessKey)) {
    msg = msg.split(cfg.secretAccessKey).join('***')
  }
  return msg
}
