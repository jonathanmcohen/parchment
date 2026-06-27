import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// F1-T1 — resolveS3Config env > DB precedence.
// Mock the encrypted config repo so we can inject DB-side values; flip the
// BACKUP_S3_* env vars to assert env wins for the four secrets.

const { getAppConfig, getAppConfigJson } = vi.hoisted(() => ({
  getAppConfig: vi.fn<(key: string) => Promise<string | null>>(),
  getAppConfigJson: vi.fn<(key: string) => Promise<unknown>>(),
}))

vi.mock('@/lib/config/repo', () => ({
  getAppConfig,
  getAppConfigJson,
  setAppConfig: vi.fn(),
  setAppConfigJson: vi.fn(),
  deleteAppConfig: vi.fn(),
}))

const S3_VARS = [
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
  'BACKUP_S3_REGION',
] as const

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of S3_VARS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  getAppConfig.mockReset().mockResolvedValue(null)
  getAppConfigJson.mockReset().mockResolvedValue(null)
})

afterEach(() => {
  for (const k of S3_VARS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('resolveS3Config — env > DB precedence', () => {
  it('env wins for the four secrets when all four BACKUP_S3_* are set', async () => {
    process.env.BACKUP_S3_ENDPOINT = 'https://env.minio:9000'
    process.env.BACKUP_S3_BUCKET = 'env-bucket'
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'ENV_KEY'
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'env-secret'
    // DB carries different secret values + the non-secret tunables.
    getAppConfig.mockImplementation(async (key: string) => {
      const dbVals: Record<string, string> = {
        's3.endpoint': 'https://db.minio:9000',
        's3.bucket': 'db-bucket',
        's3.accessKeyId': 'DB_KEY',
        's3.secretAccessKey': 'db-secret',
        's3.region': 'db-region',
        's3.prefix': 'backups/',
      }
      return dbVals[key] ?? null
    })
    getAppConfigJson.mockImplementation(async (key: string) => {
      if (key === 's3.scheduleHours') return 12
      if (key === 's3.enabled') return true
      return null
    })

    const { resolveS3Config } = await import('@/lib/backup/s3-config')
    const cfg = await resolveS3Config()
    expect(cfg).not.toBeNull()
    // Secrets come from env (env wins).
    expect(cfg?.endpoint).toBe('https://env.minio:9000')
    expect(cfg?.bucket).toBe('env-bucket')
    expect(cfg?.accessKeyId).toBe('ENV_KEY')
    expect(cfg?.secretAccessKey).toBe('env-secret')
    // prefix/schedule come from DB.
    expect(cfg?.prefix).toBe('backups/')
    expect(cfg?.scheduleHours).toBe(12)
    // env-config is always considered active/enabled.
    expect(cfg?.enabled).toBe(true)
  })

  it('returns DB config when env vars are absent but DB has enabled + all four secrets', async () => {
    getAppConfig.mockImplementation(async (key: string) => {
      const dbVals: Record<string, string> = {
        's3.endpoint': 'https://db.minio:9000',
        's3.bucket': 'db-bucket',
        's3.accessKeyId': 'DB_KEY',
        's3.secretAccessKey': 'db-secret',
        's3.region': 'eu-west-1',
        's3.prefix': '',
      }
      return dbVals[key] ?? null
    })
    getAppConfigJson.mockImplementation(async (key: string) => {
      if (key === 's3.scheduleHours') return 24
      if (key === 's3.enabled') return true
      return null
    })

    const { resolveS3Config } = await import('@/lib/backup/s3-config')
    const cfg = await resolveS3Config()
    expect(cfg).not.toBeNull()
    expect(cfg?.endpoint).toBe('https://db.minio:9000')
    expect(cfg?.bucket).toBe('db-bucket')
    expect(cfg?.accessKeyId).toBe('DB_KEY')
    expect(cfg?.secretAccessKey).toBe('db-secret')
    expect(cfg?.region).toBe('eu-west-1')
    expect(cfg?.enabled).toBe(true)
  })

  it('returns null when env sets endpoint but not bucket (partial env is invalid)', async () => {
    process.env.BACKUP_S3_ENDPOINT = 'https://env.minio:9000'
    // No bucket, no keys → partial env. DB is empty too.
    const { resolveS3Config } = await import('@/lib/backup/s3-config')
    expect(await resolveS3Config()).toBeNull()
  })

  it('returns null when neither env nor DB is configured', async () => {
    const { resolveS3Config } = await import('@/lib/backup/s3-config')
    expect(await resolveS3Config()).toBeNull()
  })

  it('returns null when DB has secrets but s3.enabled is false', async () => {
    getAppConfig.mockImplementation(async (key: string) => {
      const dbVals: Record<string, string> = {
        's3.endpoint': 'https://db.minio:9000',
        's3.bucket': 'db-bucket',
        's3.accessKeyId': 'DB_KEY',
        's3.secretAccessKey': 'db-secret',
      }
      return dbVals[key] ?? null
    })
    getAppConfigJson.mockImplementation(async (key: string) => {
      if (key === 's3.enabled') return false
      return null
    })
    const { resolveS3Config } = await import('@/lib/backup/s3-config')
    expect(await resolveS3Config()).toBeNull()
  })
})
