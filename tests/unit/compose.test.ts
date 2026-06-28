import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

describe('docker-compose.yml structure', () => {
  const raw = readFileSync('docker-compose.yml', 'utf8')
  const compose = parse(raw)

  it('has a db service', () => {
    expect(compose.services).toHaveProperty('db')
  })
  it('db service has a healthcheck', () => {
    expect(compose.services.db.healthcheck).toBeDefined()
  })
  it('db service uses the pgvector image', () => {
    expect(compose.services.db.image).toMatch(/pgvector/)
  })
  it('has an app service', () => {
    expect(compose.services).toHaveProperty('app')
  })
  it('app service DATABASE_URL references db host', () => {
    const envBlock = compose.services.app.environment as Record<string, string>
    const url = envBlock.DATABASE_URL ?? ''
    expect(url).toMatch(/db/)
  })
  it('has a named volume for postgres data', () => {
    expect(compose.volumes).toBeDefined()
    const volNames = Object.keys(compose.volumes)
    expect(volNames.some((v) => v.includes('pg'))).toBe(true)
  })
  it('db service mounts the postgres volume', () => {
    const vols: string[] = compose.services.db.volumes ?? []
    expect(vols.some((v: string) => v.includes('/var/lib/postgresql'))).toBe(true)
  })

  // ── §4 env-var registry coverage ─────────────────────────────────────────
  // Every variable listed in the reconciliation §4 must appear in the compose
  // environment block (required ones active, optional ones at least commented).
  // This test reads the RAW text to catch commented-out entries too.
  const REQUIRED_VARS = [
    'PARCHMENT_SECRET_KEY',
    'PARCHMENT_PUBLIC_URL',
    'DATABASE_URL',
    'PARCHMENT_VERSION',
    'PORT',
    'SECURE_COOKIES',
    'COLLAB_URL',
    'COLLAB_PORT',
    'PARCHMENT_FILES_ROOT',
    'LOG_LEVEL',
    'LOG_FORMAT',
    'METRICS_TOKEN',
    'PARCHMENT_DEFAULT_QUOTA_MB',
    'PARCHMENT_LOCK_DIR',
    'BACKUP_S3_ENDPOINT',
    'BACKUP_S3_BUCKET',
    'BACKUP_S3_ACCESS_KEY_ID',
    'BACKUP_S3_SECRET_ACCESS_KEY',
    'EMBEDDINGS_URL',
    'EMBEDDINGS_API_KEY',
    'EMBEDDINGS_MODEL',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
  ]
  for (const v of REQUIRED_VARS) {
    it(`compose.yml documents env var ${v}`, () => {
      expect(raw).toContain(v)
    })
  }

  // ── .env.example coverage ─────────────────────────────────────────────────
  const envExample = readFileSync('.env.example', 'utf8')
  for (const v of REQUIRED_VARS) {
    it(`.env.example documents env var ${v}`, () => {
      expect(envExample).toContain(v)
    })
  }
})
