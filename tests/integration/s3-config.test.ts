import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

// INT-T1 — S3 config round-trip against real Postgres (Testcontainers). The AWS
// SDK is never touched here (no MinIO container) — only the encrypted DB
// round-trip + env precedence + masked-secret preservation.

let container: StartedPostgreSqlContainer
const migrationsDir = path.resolve('src/db/migrations')

const S3_ENV = [
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
  'BACKUP_S3_REGION',
] as const
const savedEnv: Record<string, string | undefined> = {}

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()

  const url = container.getConnectionUri()
  const c = new Client({ connectionString: url })
  await c.connect()
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  await c.end()
  process.env.DATABASE_URL = url
  // Ensure no env-precedence leakage from the host.
  for (const k of S3_ENV) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
  for (const k of S3_ENV) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

afterEach(() => {
  for (const k of S3_ENV) delete process.env[k]
})

describe('INT-T1 — S3 config round-trip', () => {
  it('saveS3Config then resolveS3Config returns the saved config (decrypted)', async () => {
    const { saveS3Config, resolveS3Config, clearS3Config } = await import('@/lib/backup/s3-config')
    await clearS3Config()
    await saveS3Config({
      endpoint: 'https://minio.local:9000',
      bucket: 'parchment',
      accessKeyId: 'AKIADB',
      secretAccessKey: 'db-secret-value',
      region: 'eu-west-1',
      prefix: 'backups/',
      scheduleHours: 12,
      enabled: true,
    })
    const cfg = await resolveS3Config()
    expect(cfg).not.toBeNull()
    expect(cfg?.endpoint).toBe('https://minio.local:9000')
    expect(cfg?.secretAccessKey).toBe('db-secret-value')
    expect(cfg?.region).toBe('eu-west-1')
    expect(cfg?.scheduleHours).toBe(12)
  })

  it('env vars override DB config', async () => {
    const { saveS3Config, resolveS3Config } = await import('@/lib/backup/s3-config')
    await saveS3Config({
      endpoint: 'https://db.local:9000',
      bucket: 'db-bucket',
      accessKeyId: 'DBKEY',
      secretAccessKey: 'db-secret',
      enabled: true,
    })
    process.env.BACKUP_S3_ENDPOINT = 'https://env.local:9000'
    process.env.BACKUP_S3_BUCKET = 'env-bucket'
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'ENVKEY'
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'env-secret'
    const cfg = await resolveS3Config()
    expect(cfg?.endpoint).toBe('https://env.local:9000')
    expect(cfg?.bucket).toBe('env-bucket')
    expect(cfg?.secretAccessKey).toBe('env-secret')
  })

  it('saving with secretAccessKey undefined does not overwrite the stored secret', async () => {
    const { saveS3Config, resolveS3Config, clearS3Config } = await import('@/lib/backup/s3-config')
    await clearS3Config()
    await saveS3Config({
      endpoint: 'https://minio.local:9000',
      bucket: 'parchment',
      accessKeyId: 'AKIADB',
      secretAccessKey: 'original-secret',
      enabled: true,
    })
    // Re-save WITHOUT a secret (e.g. the UI sent the mask, which the route drops).
    await saveS3Config({
      endpoint: 'https://minio.local:9000',
      bucket: 'parchment2',
      enabled: true,
    })
    const cfg = await resolveS3Config()
    expect(cfg?.bucket).toBe('parchment2')
    expect(cfg?.secretAccessKey).toBe('original-secret') // unchanged
  })
})
