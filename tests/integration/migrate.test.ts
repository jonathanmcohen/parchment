import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// INT-T2 — migrate push→receive round-trip. The receive route handler is called
// DIRECTLY (no HTTP between processes). One DB, one admin owner.

let container: StartedPostgreSqlContainer
let adminId: string
const migrationsDir = path.resolve('src/db/migrations')

const TOKEN = 'integration-migrate-token-value'

function makeReq(opts: { auth?: string; bytes: Uint8Array; dry?: boolean }) {
  const url = `https://target.local/api/migrate/receive${opts.dry ? '?dry=true' : ''}`
  const headers = new Map<string, string>()
  if (opts.auth) headers.set('authorization', opts.auth)
  headers.set('content-length', String(opts.bytes.byteLength))
  return {
    nextUrl: new URL(url),
    url,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    arrayBuffer: async () =>
      opts.bytes.buffer.slice(opts.bytes.byteOffset, opts.bytes.byteOffset + opts.bytes.byteLength),
  } as never
}

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
  const u = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('admin@p.local','Admin','owner') RETURNING id",
  )
  adminId = u.rows[0]?.id ?? ''
  await c.end()
  process.env.DATABASE_URL = url
  // Store the receive token hash.
  const { setAppConfig } = await import('@/lib/config/repo')
  const { hashMigrateToken } = await import('@/lib/migrate/token')
  await setAppConfig('migrate.tokenHash', hashMigrateToken(TOKEN))
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

async function buildBackupBytes(): Promise<Uint8Array> {
  const { createDocument } = await import('@/lib/docs/repo')
  await createDocument(adminId, { title: 'Doc One', content: { type: 'doc', content: [] } })
  await createDocument(adminId, { title: 'Doc Two', content: { type: 'doc', content: [] } })
  const { createWorkspaceBackup } = await import('@/lib/backup/service')
  return createWorkspaceBackup(adminId, new Date().toISOString())
}

describe('INT-T2 — migrate receive round-trip', () => {
  it('valid token restores docs into the admin workspace', async () => {
    const bytes = await buildBackupBytes()
    // Wipe existing docs so we observe the restore count cleanly.
    const { db, schema } = await import('@/db')
    await db.delete(schema.documents)

    const { POST } = await import('@/app/api/migrate/receive/route')
    const res = await POST(makeReq({ auth: `Bearer ${TOKEN}`, bytes }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.created).toBeGreaterThanOrEqual(2)

    const { listDocuments } = await import('@/lib/docs/repo')
    const docs = await listDocuments(adminId)
    expect(docs.length).toBeGreaterThanOrEqual(2)
  })

  it('wrong token → 403', async () => {
    const bytes = await buildBackupBytes()
    const { POST } = await import('@/app/api/migrate/receive/route')
    const res = await POST(makeReq({ auth: 'Bearer wrong-token', bytes }))
    expect(res.status).toBe(403)
  })

  it('dry-run reports wouldCreate without writing', async () => {
    const bytes = await buildBackupBytes()
    const { db, schema } = await import('@/db')
    await db.delete(schema.documents)
    const before = (await (await import('@/lib/docs/repo')).listDocuments(adminId)).length

    const { POST } = await import('@/app/api/migrate/receive/route')
    const res = await POST(makeReq({ auth: `Bearer ${TOKEN}`, bytes, dry: true }))
    const body = await res.json()
    expect(body.dryRun).toBe(true)
    expect(body.wouldCreate).toBeGreaterThanOrEqual(2)

    const after = (await (await import('@/lib/docs/repo')).listDocuments(adminId)).length
    expect(after).toBe(before) // nothing written
  })

  it('corrupt backup → 400', async () => {
    const { POST } = await import('@/app/api/migrate/receive/route')
    const res = await POST(
      makeReq({ auth: `Bearer ${TOKEN}`, bytes: new Uint8Array([1, 2, 3, 4]) }),
    )
    expect(res.status).toBe(400)
  })
})
