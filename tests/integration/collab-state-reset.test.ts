import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// v0.2.7 #2: prove the real SQL behind the release-notes refresh's collab-snapshot
// reset. The unit test (refresh-release-notes-doc.test.ts) mocks the repo and only
// asserts deleteCollabState is CALLED on the unedited branch; this asserts the
// delete actually removes the collab_state row so hasCollabState flips false and the
// next editor open re-seeds from documents.content (the whole point of the fix).

let container: StartedPostgreSqlContainer
let ownerId: string
let docId: string
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
  const { rows: docRows } = await c.query<{ id: string }>(
    "insert into documents (owner_id, title, markdown) values ($1, 'Release notes — v0.1.0', '# r') returning id",
    [ownerId],
  )
  docId = docRows[0]?.id ?? ''
  // Simulate a doc that has been opened (a persisted Yjs snapshot exists).
  await c.query('insert into collab_state (name, state) values ($1, $2)', [
    docId,
    Buffer.from([1, 2, 3, 4]),
  ])
  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('deleteCollabState (v0.2.7 #2)', () => {
  it('removes the persisted Yjs snapshot so hasCollabState flips false', async () => {
    const { deleteCollabState, hasCollabState } = await import('@/lib/docs/repo')

    // Precondition: the snapshot exists (doc was opened) → editor would NOT re-seed.
    expect(await hasCollabState(docId)).toBe(true)

    const removed = await deleteCollabState(docId)
    expect(removed).toBe(1)

    // Now the gate is false → the next open seeds from the freshly-written content.
    expect(await hasCollabState(docId)).toBe(false)

    // Idempotent: a second delete removes nothing and never throws.
    expect(await deleteCollabState(docId)).toBe(0)
  })
})
