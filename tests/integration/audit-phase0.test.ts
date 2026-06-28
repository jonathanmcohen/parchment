// Phase 0 Task 5/7 — audit hardening integration tests (Testcontainers, real Postgres 18).
//
// Covers migration 0021 (ip / prev_hash / entry_hash columns, target_id uuid→text,
// append-only BEFORE UPDATE/DELETE trigger) and the hash-chained logAudit +
// verifyAuditChain in src/lib/audit/index.ts.
//
// TDD RED record: written BEFORE migration 0021 and the logAudit rewrite existed —
// every schema/trigger/chain test failed (no columns, no trigger, no chain). Now GREEN.
//
// Pattern mirrors tests/integration/audit.test.ts: start the container, apply every
// .sql migration in sort order, point '@/db' at it via DATABASE_URL before importing
// the writer, and verify persisted rows with a raw pg Client.
//
// REQUIRES A LIVE DOCKER DAEMON (Testcontainers). Without Docker these tests cannot
// run; they are not skipped — they will error at container start.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let container: StartedPostgreSqlContainer
let url: string
// A real user row; audit_log.actor_id is a uuid FK to users(id), so the actorId we
// pass to logAudit must be an existing user id (or undefined). Seeded in beforeAll.
let ACTOR_ID: string
let ACTOR_ID_2: string

const migrationsDir = path.resolve('src/db/migrations')

async function client(): Promise<Client> {
  const c = new Client({ connectionString: url })
  await c.connect()
  return c
}

// Read every audit_log row in insertion (created_at ASC) order.
async function readAuditRows(): Promise<
  Array<{
    id: string
    action: string
    actor_id: string | null
    target_id: string | null
    ip: string | null
    prev_hash: string | null
    entry_hash: string | null
    created_at: Date
  }>
> {
  const c = await client()
  const { rows } = await c.query(
    'select id, action, actor_id, target_id, ip, prev_hash, entry_hash, created_at from audit_log order by created_at asc, id asc',
  )
  await c.end()
  return rows
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

  // Seed two users so logAudit's actor_id FK (uuid → users.id) is satisfiable.
  const u1 = await c.query<{ id: string }>(
    "insert into users (email, name) values ('audit-actor-1@example.com', 'Actor One') returning id",
  )
  const u2 = await c.query<{ id: string }>(
    "insert into users (email, name) values ('audit-actor-2@example.com', 'Actor Two') returning id",
  )
  ACTOR_ID = u1.rows[0]?.id as string
  ACTOR_ID_2 = u2.rows[0]?.id as string
  await c.end()

  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('Phase 0 — audit_log schema (migration 0021)', () => {
  async function columnType(
    col: string,
  ): Promise<{ data_type: string; is_nullable: string } | null> {
    const c = await client()
    const { rows } = await c.query<{ data_type: string; is_nullable: string }>(
      'select data_type, is_nullable from information_schema.columns where table_name = $1 and column_name = $2',
      ['audit_log', col],
    )
    await c.end()
    return rows[0] ?? null
  }

  it('audit_log has ip column (text, nullable)', async () => {
    const col = await columnType('ip')
    expect(col?.data_type).toBe('text')
    expect(col?.is_nullable).toBe('YES')
  })

  it('audit_log has prev_hash column (text, nullable)', async () => {
    const col = await columnType('prev_hash')
    expect(col?.data_type).toBe('text')
    expect(col?.is_nullable).toBe('YES')
  })

  it('audit_log has entry_hash column (text, nullable)', async () => {
    const col = await columnType('entry_hash')
    expect(col?.data_type).toBe('text')
    expect(col?.is_nullable).toBe('YES')
  })

  it('audit_log.target_id is text, not uuid — accepts a non-uuid string', async () => {
    const col = await columnType('target_id')
    expect(col?.data_type).toBe('text')
    // and a non-uuid identifier inserts without a cast error
    const c = await client()
    await c.query(
      "insert into audit_log (action, target_id) values ('create', 'not-a-uuid:smtp.password')",
    )
    const { rows } = await c.query<{ target_id: string }>(
      "select target_id from audit_log where target_id = 'not-a-uuid:smtp.password'",
    )
    await c.end()
    expect(rows[0]?.target_id).toBe('not-a-uuid:smtp.password')
  })
})

describe('Phase 0 — append-only trigger', () => {
  it('UPDATE on audit_log raises an exception (trigger blocks it)', async () => {
    const c = await client()
    await c.query("insert into audit_log (action) values ('login')")
    const { rows } = await c.query<{ id: string }>(
      "select id from audit_log where action = 'login' order by created_at desc limit 1",
    )
    const id = rows[0]?.id
    await expect(c.query("update audit_log set action = 'x' where id = $1", [id])).rejects.toThrow(
      /append-only/i,
    )
    await c.end()
  })

  it('DELETE on audit_log raises an exception (trigger blocks it)', async () => {
    const c = await client()
    await c.query("insert into audit_log (action) values ('login')")
    await expect(c.query("delete from audit_log where action = 'login'")).rejects.toThrow(
      /append-only/i,
    )
    await c.end()
  })

  it('INSERT on audit_log succeeds (trigger allows it)', async () => {
    const c = await client()
    const before = await c.query<{ n: string }>('select count(*)::int as n from audit_log')
    await c.query("insert into audit_log (action) values ('share')")
    const after = await c.query<{ n: string }>('select count(*)::int as n from audit_log')
    await c.end()
    expect(Number(after.rows[0]?.n)).toBe(Number(before.rows[0]?.n) + 1)
  })
})

describe('Phase 0 — logAudit hash chain', () => {
  it('first row has prev_hash = NULL and entry_hash set to a 64-hex sha256', async () => {
    // Clear the table via a superuser-suppressed truncate so the chain starts fresh.
    const c = await client()
    await c.query('set session_replication_role = replica')
    await c.query('truncate audit_log')
    await c.query('set session_replication_role = default')
    await c.end()

    const { logAudit } = await import('@/lib/audit')
    await logAudit('login', { actorId: ACTOR_ID })

    const rows = await readAuditRows()
    expect(rows.length).toBe(1)
    expect(rows[0]?.prev_hash).toBeNull()
    expect(rows[0]?.entry_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('second row prev_hash equals first row entry_hash', async () => {
    const { logAudit } = await import('@/lib/audit')
    await logAudit('create', { actorId: ACTOR_ID, targetType: 'document', targetId: 'doc-1' })
    const rows = await readAuditRows()
    expect(rows.length).toBe(2)
    expect(rows[1]?.prev_hash).toBe(rows[0]?.entry_hash)
  })

  it('third row prev_hash equals second row entry_hash — chain is intact', async () => {
    const { logAudit } = await import('@/lib/audit')
    await logAudit('export', { actorId: ACTOR_ID })
    const rows = await readAuditRows()
    expect(rows.length).toBe(3)
    expect(rows[2]?.prev_hash).toBe(rows[1]?.entry_hash)
  })

  it('logAudit with ip stores the ip in audit_log.ip', async () => {
    const { logAudit } = await import('@/lib/audit')
    await logAudit('login', { actorId: ACTOR_ID_2, ip: '203.0.113.7' })
    const rows = await readAuditRows()
    expect(rows.at(-1)?.ip).toBe('203.0.113.7')
  })

  it('logAudit with merged AuditAction verb "user.create" writes successfully', async () => {
    const { logAudit } = await import('@/lib/audit')
    await logAudit('user.create', { actorId: ACTOR_ID, targetType: 'user', targetId: 'user-9' })
    const rows = await readAuditRows()
    expect(rows.at(-1)?.action).toBe('user.create')
  })

  it('logAudit with merged AuditAction verb "oidc.config" writes successfully', async () => {
    const { logAudit } = await import('@/lib/audit')
    await logAudit('oidc.config', { actorId: ACTOR_ID })
    const rows = await readAuditRows()
    expect(rows.at(-1)?.action).toBe('oidc.config')
  })

  it('logAudit with merged AuditAction verb "mfa.enable" writes successfully', async () => {
    const { logAudit } = await import('@/lib/audit')
    await logAudit('mfa.enable', { actorId: ACTOR_ID_2 })
    const rows = await readAuditRows()
    expect(rows.at(-1)?.action).toBe('mfa.enable')
  })

  it('logAudit never throws to the caller even when the DB write fails', async () => {
    // Force the underlying write to fail by making db.insert throw for this one call.
    // logAudit's outer try/catch must swallow it and resolve (auditing is a side-effect
    // and must never block the real action). Uses a spy so the live pool is untouched
    // and subsequent tests still see a healthy DB.
    const { db } = await import('@/db')
    const { logAudit } = await import('@/lib/audit')
    const spy = vi.spyOn(db, 'insert').mockImplementationOnce(() => {
      throw new Error('simulated DB failure')
    })
    try {
      await expect(logAudit('login', { actorId: 'down-test' })).resolves.toBeUndefined()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('Phase 0 — verifyAuditChain', () => {
  it('returns { ok: true } after a real insert+readback (verifies entry_hash uses DB created_at, not Date.now)', async () => {
    // Fresh chain.
    const c = await client()
    await c.query('set session_replication_role = replica')
    await c.query('truncate audit_log')
    await c.query('set session_replication_role = default')
    await c.end()

    const { logAudit, verifyAuditChain } = await import('@/lib/audit')
    await logAudit('login', { actorId: ACTOR_ID })
    const result = await verifyAuditChain()
    expect(result.ok).toBe(true)
    expect(result.brokenAt).toBeUndefined()
  })

  it('returns { ok: true } when the chain is intact after 3 rows', async () => {
    const { logAudit, verifyAuditChain } = await import('@/lib/audit')
    await logAudit('create', { actorId: ACTOR_ID, targetId: 'd1' })
    await logAudit('export', { actorId: ACTOR_ID })
    const result = await verifyAuditChain()
    expect(result.ok).toBe(true)
  })

  it('returns { ok: false, brokenAt: <hash> } when a stored entry_hash is tampered', async () => {
    const { verifyAuditChain } = await import('@/lib/audit')
    const rows = await readAuditRows()
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const victim = rows[0]
    if (!victim) throw new Error('no rows to tamper')
    const original = victim.entry_hash

    // Tamper bypasses the append-only trigger via superuser session_replication_role.
    const c = await client()
    await c.query('set session_replication_role = replica')
    await c.query("update audit_log set entry_hash = repeat('0', 64) where id = $1", [victim.id])
    await c.query('set session_replication_role = default')
    await c.end()

    const result = await verifyAuditChain()
    expect(result.ok).toBe(false)
    // brokenAt is the STORED (tampered) entry_hash of the first broken row.
    expect(result.brokenAt).toBe('0'.repeat(64))

    // restore so later assertions on the same container are not corrupted
    const c2 = await client()
    await c2.query('set session_replication_role = replica')
    await c2.query('update audit_log set entry_hash = $2 where id = $1', [victim.id, original])
    await c2.query('set session_replication_role = default')
    await c2.end()
  })
})
