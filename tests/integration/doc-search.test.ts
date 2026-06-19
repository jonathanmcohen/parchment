import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// B6: searchDocuments — fuzzy title search against real Postgres.

let container: StartedPostgreSqlContainer
let ownerId: string
const migrationsDir = path.resolve('src/db/migrations')

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
  const { rows } = await c.query<{ id: string }>(
    "insert into users (email, name, role) values ('search@p.local','Searcher','owner') returning id",
  )
  ownerId = rows[0]?.id ?? ''
  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('B6 — searchDocuments repo', () => {
  it('returns docs matching a case-insensitive title substring', async () => {
    const { createDocument, searchDocuments } = await import('@/lib/docs/repo')
    await createDocument(ownerId, { title: 'My specification document' })
    await createDocument(ownerId, { title: 'Technical spec overview' })
    await createDocument(ownerId, { title: 'Completely unrelated' })

    const results = await searchDocuments(ownerId, 'spec')
    const titles = results.map((d) => d.title)
    expect(titles).toContain('My specification document')
    expect(titles).toContain('Technical spec overview')
    expect(titles).not.toContain('Completely unrelated')
  })

  it('empty query returns recent docs (up to limit)', async () => {
    const { createDocument, searchDocuments } = await import('@/lib/docs/repo')
    await createDocument(ownerId, { title: 'Recent A' })
    await createDocument(ownerId, { title: 'Recent B' })

    const results = await searchDocuments(ownerId, '')
    expect(results.length).toBeGreaterThanOrEqual(2)
    // Should be ordered newest first
    expect(results[0]).toHaveProperty('id')
    expect(results[0]).toHaveProperty('title')
  })

  it('respects the limit parameter', async () => {
    const { createDocument, searchDocuments } = await import('@/lib/docs/repo')
    for (let i = 0; i < 5; i++) {
      await createDocument(ownerId, { title: `Limited doc ${i}` })
    }
    const results = await searchDocuments(ownerId, '', 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('does not return trashed documents', async () => {
    const { createDocument, searchDocuments } = await import('@/lib/docs/repo')
    const { id } = await createDocument(ownerId, { title: 'Trashed document uniquetrash' })

    // Manually trash the doc.
    const { db, schema } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    await db
      .update(schema.documents)
      .set({ trashedAt: new Date() })
      .where(eq(schema.documents.id, id))

    const results = await searchDocuments(ownerId, 'uniquetrash')
    expect(results.map((d) => d.id)).not.toContain(id)
  })

  it('does not return docs from other owners', async () => {
    const { createDocument, searchDocuments } = await import('@/lib/docs/repo')

    // Create a second user
    const c = new Client({ connectionString: container.getConnectionUri() })
    await c.connect()
    const { rows } = await c.query<{ id: string }>(
      "insert into users (email, name, role) values ('other@p.local','Other','owner') returning id",
    )
    const otherId = rows[0]?.id ?? ''
    await c.end()

    await createDocument(otherId, { title: 'Other user crosscheck doc' })

    const results = await searchDocuments(ownerId, 'crosscheck')
    expect(results.map((d) => d.id).length).toBe(0)
  })
})
