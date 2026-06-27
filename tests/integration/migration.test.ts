import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A1 acceptance: Testcontainers spins PG, migration applies, health query returns.
// Real Postgres 18 + pgvector via Testcontainers — no external DB required.

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
    // `--> statement-breakpoint` lines are SQL comments; pg runs the whole file.
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  await c.end()
}, 180_000)

afterAll(async () => {
  await container?.stop()
})

describe('A1 — migration + schema', () => {
  it('creates exactly the expected tables (v0.1 + Phase 0 app_config)', async () => {
    const c = await client()
    const { rows } = await c.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by 1",
    )
    await c.end()
    expect(rows.map((r) => r.tablename)).toEqual([
      // Phase 0 §1b — instance encrypted config (migration 0020).
      'app_config',
      'audit_log',
      'cairn_links',
      'collab_state',
      'comments',
      'doc_links',
      'doc_versions',
      'document_permissions',
      'document_tags',
      'documents',
      'folders',
      'invites',
      'login_lockouts',
      'oidc_identities',
      'oidc_login_flows',
      'passkeys',
      'pats',
      'sessions',
      'settings',
      'shares',
      'smart_folders',
      'tags',
      'templates',
      'user_mfa',
      'users',
      'webhooks',
    ])
  })

  it('installs pgvector and the hnsw + gin search indexes', async () => {
    const c = await client()
    const ext = await c.query("select extversion from pg_extension where extname = 'vector'")
    const idx = await c.query<{ indexname: string }>(
      "select indexname from pg_indexes where tablename = 'documents'",
    )
    await c.end()
    expect(ext.rows.length).toBe(1)
    const names = idx.rows.map((r) => r.indexname)
    expect(names).toContain('documents_embedding_idx') // hnsw / pgvector
    expect(names).toContain('documents_search_idx') // gin / tsvector
  })

  it('answers the health probe query', async () => {
    const c = await client()
    const { rows } = await c.query<{ ok: number }>('select 1 as ok')
    await c.end()
    expect(rows[0]?.ok).toBe(1)
  })

  it('0022 adds disabled_at, document_permissions, invites', async () => {
    const c = await client()
    const cols = await c.query(
      `select column_name from information_schema.columns where table_name='users'`,
    )
    expect(cols.rows.map((r) => r.column_name)).toContain('disabled_at')

    const tables = await c.query(
      `select table_name from information_schema.tables where table_schema='public'`,
    )
    const names = tables.rows.map((r) => r.table_name)
    expect(names).toContain('document_permissions')
    expect(names).toContain('invites')

    // document_permissions PK is (doc_id, user_id)
    const pk = await c.query(
      `select a.attname from pg_index i
         join pg_attribute a on a.attrelid=i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid='document_permissions'::regclass and i.indisprimary`,
    )
    await c.end()
    expect(pk.rows.map((r) => r.attname).sort()).toEqual(['doc_id', 'user_id'])
  })
})
