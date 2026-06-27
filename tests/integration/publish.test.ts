import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { NextRequest } from 'next/server'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// H Task 12 — publish-to-web: the public share data path returns a read-only,
// safe-shape `comments` array (display data only, NEVER authorId/email) when the
// link grants view; a `view` publish link still returns the read-only doc (200).

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
  process.env.DATABASE_URL = container.getConnectionUri()

  const c = new Client({ connectionString: container.getConnectionUri() })
  await c.connect()
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  const owner = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('owner@p.local','Owner','owner') RETURNING id",
  )
  ownerId = owner.rows[0]?.id ?? ''
  const doc = await c.query<{ id: string }>(
    `INSERT INTO documents (title, owner_id, markdown, content)
     VALUES ('Published', $1, 'body\n', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}')
     RETURNING id`,
    [ownerId],
  )
  docId = doc.rows[0]?.id ?? ''
  await c.end()
}, 180_000)

afterAll(async () => {
  await container?.stop()
})

function shareReq(token: string): NextRequest {
  return new NextRequest(`http://x/api/share/${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
}

describe('publish-to-web share data path', () => {
  it('a view publish link returns 200 read-only doc + a safe comments array (no authorId/email)', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { createThread } = await import('@/lib/docs/comments-repo')
    const { POST } = await import('@/app/api/share/[token]/route')

    // Seed an OPEN comment + a RESOLVED one.
    await createThread(docId, ownerId, { body: 'open note', anchorFrom: 1, anchorTo: 5 })
    const resolved = await createThread(docId, ownerId, {
      body: 'done note',
      anchorFrom: 1,
      anchorTo: 5,
    })
    const { setResolved } = await import('@/lib/docs/comments-repo')
    await setResolved(resolved.id, docId, true)

    const view = await createShare(ownerId, docId, { permission: 'view' })
    const res = await POST(shareReq(view.token), { params: Promise.resolve({ token: view.token }) })
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      title: string
      contentJson: unknown
      permission: string
      comments?: Array<Record<string, unknown>>
    }
    expect(data.title).toBe('Published')
    expect(data.permission).toBe('view')
    expect(Array.isArray(data.comments)).toBe(true)

    // Open comment present; resolved excluded by default.
    const bodies = (data.comments ?? []).map((c) => c.body)
    expect(bodies).toContain('open note')
    expect(bodies).not.toContain('done note')

    // SAFE shape: never leak authorId or email.
    for (const c of data.comments ?? []) {
      expect(c).not.toHaveProperty('authorId')
      expect(JSON.stringify(c)).not.toContain('@p.local')
      expect(c).toHaveProperty('id')
      expect(c).toHaveProperty('body')
      expect(c).toHaveProperty('resolved')
    }
  })

  it('still returns the doc when there are no comments', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { POST } = await import('@/app/api/share/[token]/route')
    // A different doc with no comments.
    const c = new Client({ connectionString: container.getConnectionUri() })
    await c.connect()
    const d = await c.query<{ id: string }>(
      `INSERT INTO documents (title, owner_id, markdown, content)
       VALUES ('Empty', $1, 'x\n', '{"type":"doc","content":[]}') RETURNING id`,
      [ownerId],
    )
    const emptyDocId = d.rows[0]?.id ?? ''
    await c.end()
    const view = await createShare(ownerId, emptyDocId, { permission: 'view' })
    const res = await POST(shareReq(view.token), { params: Promise.resolve({ token: view.token }) })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { comments?: unknown[] }
    expect(Array.isArray(data.comments)).toBe(true)
    expect(data.comments).toHaveLength(0)
  })
})
