import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { NextRequest } from 'next/server'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// H Task 9 — permission-based comment routes.
//   • Share-scoped /api/share/[token]/comments: a `view` token can READ, cannot
//     POST (403); a `comment` token can do both; an EXPIRED token → 404 (bar #6).
//   • Cross-doc IDOR (§7e): PATCH/DELETE /api/docs/[id]/comments/[commentId] with a
//     valid commentId belonging to a DIFFERENT doc → 404, target untouched.

let container: StartedPostgreSqlContainer
let client: Client
let ownerId: string
let docAId: string
let docBId: string
let ownerToken: string
const migrationsDir = path.resolve('src/db/migrations')

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()
  process.env.DATABASE_URL = container.getConnectionUri()

  client = new Client({ connectionString: container.getConnectionUri() })
  await client.connect()
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await client.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  const owner = await client.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('owner@p.local','Owner','owner') RETURNING id",
  )
  ownerId = owner.rows[0]?.id ?? ''
  const a = await client.query<{ id: string }>(
    `INSERT INTO documents (title, owner_id, markdown) VALUES ('Doc A', $1, 'a\n') RETURNING id`,
    [ownerId],
  )
  docAId = a.rows[0]?.id ?? ''
  const b = await client.query<{ id: string }>(
    `INSERT INTO documents (title, owner_id, markdown) VALUES ('Doc B', $1, 'b\n') RETURNING id`,
    [ownerId],
  )
  docBId = b.rows[0]?.id ?? ''

  const { issuePat } = await import('@/lib/auth/pat')
  ownerToken = (await issuePat(ownerId, 'owner-pat')).token
}, 180_000)

afterAll(async () => {
  await client?.end()
  await container?.stop()
})

function shareReq(token: string, body: unknown, method = 'POST'): NextRequest {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: { 'content-type': 'application/json' },
  }
  if (method !== 'GET') init.body = JSON.stringify(body)
  return new NextRequest(`http://x/api/share/${token}/comments`, init)
}
function docCommentReq(token: string, body: unknown, method = 'PATCH'): NextRequest {
  return new NextRequest('http://x/api/docs/x/comments/y', {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('share-scoped comment route — view link CANNOT comment', () => {
  it('POST with a VIEW token → 403 (no cookie, token-only)', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { POST } = await import('@/app/api/share/[token]/comments/route')
    const view = await createShare(ownerId, docAId, { permission: 'view' })
    const res = await POST(shareReq(view.token, { body: 'nope' }), {
      params: Promise.resolve({ token: view.token }),
    })
    expect(res.status).toBe(403)
  })

  it('POST with a COMMENT token → 201, row created with authorId null + token doc id', async () => {
    const { createShare, resolveShare } = await import('@/lib/docs/shares-repo')
    const { POST } = await import('@/app/api/share/[token]/comments/route')
    const comment = await createShare(ownerId, docAId, { permission: 'comment' })
    const res = await POST(shareReq(comment.token, { body: 'hi from link' }), {
      params: Promise.resolve({ token: comment.token }),
    })
    expect(res.status).toBe(201)
    const json = (await res.json()) as { id: string }
    const row = await client.query<{ author_id: string | null; doc_id: string }>(
      'SELECT author_id, doc_id FROM comments WHERE id = $1',
      [json.id],
    )
    expect(row.rows[0]?.author_id).toBeNull()
    expect(row.rows[0]?.doc_id).toBe(docAId)
    // the share row still resolves (sanity)
    expect(await resolveShare(comment.token)).not.toBeNull()
  })

  it('POST with an EXPIRED comment token → 404 (bar #6)', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { POST } = await import('@/app/api/share/[token]/comments/route')
    const expired = await createShare(ownerId, docAId, {
      permission: 'comment',
      expiresAt: new Date(Date.now() - 60_000),
    })
    const res = await POST(shareReq(expired.token, { body: 'x' }), {
      params: Promise.resolve({ token: expired.token }),
    })
    expect(res.status).toBe(404)
  })

  it('GET with a VIEW token → 200 read-only thread list', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { GET } = await import('@/app/api/share/[token]/comments/route')
    const view = await createShare(ownerId, docAId, { permission: 'view' })
    const res = await GET(shareReq(view.token, null, 'GET'), {
      params: Promise.resolve({ token: view.token }),
    })
    expect(res.status).toBe(200)
    const rows = (await res.json()) as unknown[]
    expect(Array.isArray(rows)).toBe(true)
  })
})

describe('cross-doc comment IDOR (§7e)', () => {
  it('PATCH /api/docs/[docA]/comments/[commentOnB] → 404, comment on B untouched', async () => {
    const { createThread } = await import('@/lib/docs/comments-repo')
    const { PATCH } = await import('@/app/api/docs/[id]/comments/[commentId]/route')
    const onB = await createThread(docBId, ownerId, { body: 'on B', anchorFrom: 1, anchorTo: 2 })

    const res = await PATCH(docCommentReq(ownerToken, { resolved: true }), {
      params: Promise.resolve({ id: docAId, commentId: onB.id }),
    })
    expect(res.status).toBe(404)
    const row = await client.query<{ resolved: boolean }>(
      'SELECT resolved FROM comments WHERE id = $1',
      [onB.id],
    )
    expect(row.rows[0]?.resolved).toBe(false) // NOT modified
  })

  it('DELETE /api/docs/[docA]/comments/[commentOnB] → 404, comment on B still present', async () => {
    const { createThread } = await import('@/lib/docs/comments-repo')
    const { DELETE } = await import('@/app/api/docs/[id]/comments/[commentId]/route')
    const onB = await createThread(docBId, ownerId, { body: 'keep me', anchorFrom: 1, anchorTo: 2 })

    const res = await DELETE(docCommentReq(ownerToken, {}, 'DELETE'), {
      params: Promise.resolve({ id: docAId, commentId: onB.id }),
    })
    expect(res.status).toBe(404)
    const row = await client.query('SELECT id FROM comments WHERE id = $1', [onB.id])
    expect(row.rowCount).toBe(1) // still there
  })
})
