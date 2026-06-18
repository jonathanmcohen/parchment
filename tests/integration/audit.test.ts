import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A4 acceptance: logAudit writes an append-only row that reads back with the
// right action. Mirrors migration.test.ts — real Postgres 18 via Testcontainers.
//
// We point '@/db' at the container by setting DATABASE_URL *before* a dynamic
// import of the writer, and verify the persisted row with a raw pg Client that
// reads the real columns directly (avoids any ORM/module-cache assumptions).

let container: StartedPostgreSqlContainer
let url: string

const migrationsDir = path.resolve('src/db/migrations')

async function client(): Promise<Client> {
  const c = new Client({ connectionString: url })
  await c.connect()
  return c
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()
  url = container.getConnectionUri()

  const c = await client()
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const f of files) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  await c.end()

  // Make '@/db' connect to the container. Must be set before the writer import.
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  // Close the shared '@/db' pool before the container dies, else its idle
  // connection errors with 57P01 during teardown.
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('A4 — audit log writer', () => {
  it('writes a row that reads back with the right action', async () => {
    const { logAudit } = await import('@/lib/audit')

    await logAudit('login', { meta: { ip: '127.0.0.1' } })

    const c = await client()
    const { rows } = await c.query<{
      action: string
      target_type: string | null
      target_id: string | null
      meta: Record<string, unknown> | null
    }>(
      'select action, target_type, target_id, meta from audit_log order by created_at desc limit 1',
    )
    await c.end()

    expect(rows.length).toBe(1)
    expect(rows[0]?.action).toBe('login')
    expect(rows[0]?.target_type).toBeNull()
    expect(rows[0]?.meta).toEqual({ ip: '127.0.0.1' })
  })

  it('persists target metadata for a create event', async () => {
    const { logAudit } = await import('@/lib/audit')

    await logAudit('create', { targetType: 'document', meta: { title: 'Untitled' } })

    const c = await client()
    const { rows } = await c.query<{ action: string; target_type: string | null }>(
      "select action, target_type from audit_log where action = 'create' order by created_at desc limit 1",
    )
    await c.end()

    expect(rows[0]?.action).toBe('create')
    expect(rows[0]?.target_type).toBe('document')
  })

  it('appends rather than overwrites — count grows with each write', async () => {
    const { logAudit } = await import('@/lib/audit')

    const before = await client()
    const { rows: pre } = await before.query<{ n: string }>(
      'select count(*)::int as n from audit_log',
    )
    await before.end()
    const startCount = Number(pre[0]?.n ?? 0)

    await logAudit('export')
    await logAudit('share')

    const after = await client()
    const { rows: post } = await after.query<{ n: string }>(
      'select count(*)::int as n from audit_log',
    )
    await after.end()

    expect(Number(post[0]?.n ?? 0)).toBe(startCount + 2)
  })
})
