import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// B0: document lifecycle repo — create / save / get / list against real Postgres.

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
    "insert into users (email, name, role) values ('o@p.local','Owner','owner') returning id",
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

describe('B0 — docs repo', () => {
  it('creates, saves and reads back a document', async () => {
    const { createDocument, saveDocument, getDocument } = await import('@/lib/docs/repo')
    const { id } = await createDocument(ownerId, { title: 'My doc' })
    expect(id).toBeTruthy()

    const contentJson = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    }
    await saveDocument(id, { contentJson, markdown: 'hello\n', title: 'My doc' })

    const doc = await getDocument(id)
    expect(doc?.title).toBe('My doc')
    expect(doc?.markdown).toBe('hello\n')
    expect(doc?.content).toEqual(contentJson)
  })

  it('lists the owner documents, newest first', async () => {
    const { createDocument, listDocuments } = await import('@/lib/docs/repo')
    await createDocument(ownerId, { title: 'Second' })
    const list = await listDocuments(ownerId)
    expect(list.length).toBeGreaterThanOrEqual(2)
    expect(list.every((d) => typeof d.id === 'string' && typeof d.title === 'string')).toBe(true)
  })
})
