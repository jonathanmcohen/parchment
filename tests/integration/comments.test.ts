import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// D1: comment threads repo — create / reply / list / resolve against real Postgres.

let container: StartedPostgreSqlContainer
let ownerId: string
let docId: string
const migrationsDir = path.resolve('src/db/migrations')

// Inline CREATE TABLE for the comments table. The controller generates the
// real migration (0002_*.sql) later; this keeps the test self-contained until
// that file exists.
const COMMENTS_DDL = `
CREATE TABLE IF NOT EXISTS "comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "doc_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE cascade,
  "thread_id" uuid NOT NULL,
  "author_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "body" text NOT NULL,
  "mentions" jsonb NOT NULL DEFAULT '[]',
  "anchor_from" integer,
  "anchor_to" integer,
  "anchor_start" jsonb,
  "anchor_end" jsonb,
  "resolved" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "comments_doc_idx" ON "comments" ("doc_id");
CREATE INDEX IF NOT EXISTS "comments_thread_idx" ON "comments" ("thread_id");
CREATE INDEX IF NOT EXISTS "comments_doc_resolved_idx" ON "comments" ("doc_id", "resolved");
`

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()

  const url = container.getConnectionUri()
  const c = new Client({ connectionString: url })
  await c.connect()

  // Apply existing migrations (0000, 0001, …)
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }

  // Apply comments DDL if the real migration doesn't exist yet
  const hasMigration = readdirSync(migrationsDir).some(
    (f) =>
      f.endsWith('.sql') &&
      readFileSync(path.join(migrationsDir, f), 'utf8').includes('"comments"'),
  )
  if (!hasMigration) {
    await c.query(COMMENTS_DDL)
  }

  // Seed: user + document
  const userRes = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('comments@p.local','Commenter','owner') RETURNING id",
  )
  ownerId = userRes.rows[0]?.id ?? ''

  const docRes = await c.query<{ id: string }>(
    `INSERT INTO documents (title, owner_id, markdown) VALUES ('Test Doc', $1, '') RETURNING id`,
    [ownerId],
  )
  docId = docRes.rows[0]?.id ?? ''

  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('D1 — comments repo', () => {
  it('createThread returns id and threadId (id === threadId)', async () => {
    const { createThread } = await import('@/lib/docs/comments-repo')
    const result = await createThread(docId, ownerId, {
      body: 'Root comment',
      anchorFrom: 10,
      anchorTo: 20,
    })
    expect(result.id).toBeTruthy()
    expect(result.threadId).toBe(result.id)
  })

  it('listComments returns the created thread', async () => {
    const { createThread, listComments } = await import('@/lib/docs/comments-repo')
    const { threadId } = await createThread(docId, ownerId, { body: 'Another root' })
    const all = await listComments(docId)
    const found = all.find((c) => c.threadId === threadId)
    expect(found).toBeDefined()
    expect(found?.body).toBe('Another root')
    expect(found?.resolved).toBe(false)
  })

  it('addReply: two comments share the same threadId', async () => {
    const { addReply, createThread, listComments } = await import('@/lib/docs/comments-repo')
    const { threadId } = await createThread(docId, ownerId, { body: 'Thread root' })
    const reply = await addReply(docId, threadId, ownerId, { body: 'A reply' })
    expect(reply.id).toBeTruthy()

    const all = await listComments(docId)
    const thread = all.filter((c) => c.threadId === threadId)
    expect(thread.length).toBe(2)
    expect(thread.every((c) => c.threadId === threadId)).toBe(true)
  })

  it('setResolved(threadId, docId, true) marks the root comment resolved', async () => {
    const { createThread, listComments, setResolved } = await import('@/lib/docs/comments-repo')
    const { id, threadId } = await createThread(docId, ownerId, { body: 'To resolve' })
    expect(await setResolved(threadId, docId, true)).toBe(1)

    const all = await listComments(docId)
    const root = all.find((c) => c.id === id)
    expect(root?.resolved).toBe(true)
  })

  it('deleteComment removes the row (doc-scoped)', async () => {
    const { createThread, deleteComment, listComments } = await import('@/lib/docs/comments-repo')
    const { id } = await createThread(docId, ownerId, { body: 'To delete' })
    expect(await deleteComment(id, docId)).toBe(1)
    const all = await listComments(docId)
    expect(all.find((c) => c.id === id)).toBeUndefined()
  })

  // ── H1 Task 10 — durable anchor JSON persists + returns ───────────────────
  it('createThread persists anchorStart/anchorEnd JSON; listComments returns them', async () => {
    const { createThread, listComments } = await import('@/lib/docs/comments-repo')
    const start = { tname: 'default', item: { client: 1, clock: 2 }, assoc: 0 }
    const end = { tname: 'default', item: { client: 1, clock: 5 }, assoc: 0 }
    const { id } = await createThread(docId, ownerId, {
      body: 'durable',
      anchorFrom: 3,
      anchorTo: 6,
      anchorStart: start,
      anchorEnd: end,
    })
    const all = await listComments(docId)
    const row = all.find((c) => c.id === id)
    expect(row).toBeDefined()
    expect(row?.anchorStart).toEqual(start)
    expect(row?.anchorEnd).toEqual(end)
    // integer fallback still stored alongside.
    expect(row?.anchorFrom).toBe(3)
    expect(row?.anchorTo).toBe(6)
  })
})
