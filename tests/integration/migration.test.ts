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
  it('creates exactly the v0.1 tables', async () => {
    const c = await client()
    const { rows } = await c.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by 1",
    )
    await c.end()
    expect(rows.map((r) => r.tablename)).toEqual([
      'audit_log',
      'collab_state',
      'comments',
      'doc_versions',
      'document_tags',
      'documents',
      'folders',
      'pats',
      'sessions',
      'settings',
      'smart_folders',
      'tags',
      'users',
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
})
