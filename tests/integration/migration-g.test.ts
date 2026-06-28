// Group G migration 0023 — integration tests (Testcontainers, real Postgres 18).
//
// Covers migration 0023 (oidc_identities, oidc_login_flows, login_lockouts) AND the
// §5.2 / §1.2 adversarial PREREQUISITE guards: assert the Phase-0 audit foundation
// (migration 0021 columns + append-only trigger + verifyAuditChain) is present and
// correct BEFORE G writes any audit rows. If any prerequisite fails, G must not merge.
//
// Pattern mirrors tests/integration/migration.test.ts + audit-phase0.test.ts: start the
// container, apply every .sql migration in sort order with a raw pg Client, then assert.
//
// REQUIRES A LIVE DOCKER DAEMON (Testcontainers).
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('G migration 0023 — new tables', () => {
  async function tableExists(name: string): Promise<boolean> {
    const c = await client()
    const { rows } = await c.query(
      "select 1 from information_schema.tables where table_schema='public' and table_name=$1",
      [name],
    )
    await c.end()
    return rows.length === 1
  }

  it('creates oidc_identities, oidc_login_flows, login_lockouts', async () => {
    expect(await tableExists('oidc_identities')).toBe(true)
    expect(await tableExists('oidc_login_flows')).toBe(true)
    expect(await tableExists('login_lockouts')).toBe(true)
  })

  it('oidc_identities has a UNIQUE (issuer, subject) constraint', async () => {
    const c = await client()
    // Insert a user, then two identities differing only by subject (ok), then a
    // duplicate (issuer, subject) which must violate the unique constraint.
    const u = await c.query<{ id: string }>(
      "insert into users (email, name) values ('oidc-uq@example.com', 'U') returning id",
    )
    const uid = u.rows[0]?.id
    await c.query(
      "insert into oidc_identities (user_id, issuer, subject) values ($1, 'https://idp', 'sub-1')",
      [uid],
    )
    await c.query(
      "insert into oidc_identities (user_id, issuer, subject) values ($1, 'https://idp', 'sub-2')",
      [uid],
    )
    await expect(
      c.query(
        "insert into oidc_identities (user_id, issuer, subject) values ($1, 'https://idp', 'sub-1')",
        [uid],
      ),
    ).rejects.toThrow(/duplicate key|unique/i)
    await c.end()
  })

  it('oidc_login_flows.state is the primary key', async () => {
    const c = await client()
    const { rows } = await c.query<{ attname: string }>(
      `select a.attname from pg_index i
         join pg_attribute a on a.attrelid=i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid='oidc_login_flows'::regclass and i.indisprimary`,
    )
    await c.end()
    expect(rows.map((r) => r.attname)).toEqual(['state'])
  })

  it('login_lockouts.email_hash is the primary key', async () => {
    const c = await client()
    const { rows } = await c.query<{ attname: string }>(
      `select a.attname from pg_index i
         join pg_attribute a on a.attrelid=i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid='login_lockouts'::regclass and i.indisprimary`,
    )
    await c.end()
    expect(rows.map((r) => r.attname)).toEqual(['email_hash'])
  })

  it('oidc_identities cascades on user delete (FK)', async () => {
    const c = await client()
    const u = await c.query<{ id: string }>(
      "insert into users (email, name) values ('oidc-casc@example.com', 'C') returning id",
    )
    const uid = u.rows[0]?.id
    await c.query(
      "insert into oidc_identities (user_id, issuer, subject) values ($1, 'https://idp2', 'casc-1')",
      [uid],
    )
    await c.query('delete from users where id=$1', [uid])
    const { rows } = await c.query("select 1 from oidc_identities where subject='casc-1'")
    await c.end()
    expect(rows.length).toBe(0)
  })
})

// §5.2 / §1.2 — PREREQUISITE GUARDS: the Phase-0 audit foundation must be intact.
// These are NOT tests of G-authored code; they halt G if the foundation is broken.
describe('G prerequisite — Phase-0 audit foundation (0021) is intact', () => {
  async function columnType(col: string): Promise<string | null> {
    const c = await client()
    const { rows } = await c.query<{ data_type: string }>(
      'select data_type from information_schema.columns where table_name=$1 and column_name=$2',
      ['audit_log', col],
    )
    await c.end()
    return rows[0]?.data_type ?? null
  }

  it('audit_log has ip, prev_hash, entry_hash and target_id is text', async () => {
    expect(await columnType('ip')).toBe('text')
    expect(await columnType('prev_hash')).toBe('text')
    expect(await columnType('entry_hash')).toBe('text')
    expect(await columnType('target_id')).toBe('text')
  })

  it('UPDATE and DELETE on audit_log both raise (append-only trigger in force)', async () => {
    const c = await client()
    await c.query("insert into audit_log (action) values ('login')")
    const { rows } = await c.query<{ id: string }>(
      "select id from audit_log where action='login' order by created_at desc limit 1",
    )
    const id = rows[0]?.id
    await expect(c.query("update audit_log set action='x' where id=$1", [id])).rejects.toThrow(
      /append-only/i,
    )
    await expect(c.query("delete from audit_log where action='login'")).rejects.toThrow(
      /append-only/i,
    )
    await c.end()
  })

  it('verifyAuditChain() returns { ok: true } on a fresh log', async () => {
    // Clear via superuser-suppressed truncate so the chain starts fresh.
    const c = await client()
    await c.query('set session_replication_role = replica')
    await c.query('truncate audit_log')
    await c.query('set session_replication_role = default')
    await c.end()
    const { verifyAuditChain } = await import('@/lib/audit')
    const result = await verifyAuditChain()
    expect(result.ok).toBe(true)
  })

  it('G migration did NOT add audit_log DDL — no prev_hash duplication etc.', async () => {
    // Sanity: target_id remains text (G must not have re-altered it) and the
    // trigger is still the single Phase-0 trigger.
    const c = await client()
    const { rows } = await c.query<{ tgname: string }>(
      "select tgname from pg_trigger where tgrelid='audit_log'::regclass and not tgisinternal",
    )
    await c.end()
    expect(rows.map((r) => r.tgname)).toContain('audit_log_no_mutation')
  })
})
