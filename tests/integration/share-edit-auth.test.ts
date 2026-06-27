import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { NextRequest } from 'next/server'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// H Task 15 (§7h, REQUIRED) — the collab server's onAuthenticate gate. We test the
// authorize() decision function directly (calling onAuthenticate over a live WS is
// out of scope for vitest; the decision logic IS the security boundary). Cases:
//   • no token → reject
//   • valid non-expired EDIT share token for the doc → accept
//   • VIEW share token (canView, not canEdit) → reject
//   • EXPIRED edit share token → reject (bar #6 at the WS layer)
//   • EDIT token for a DIFFERENT doc than documentName → reject (cross-doc IDOR)
//   • a minted session collab-token for an editor → accept; for a viewer → reject

let container: StartedPostgreSqlContainer
let ownerId: string
let editorUserId: string
let viewerUserId: string
let docId: string
let otherDocId: string
const migrationsDir = path.resolve('src/db/migrations')

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()
  process.env.DATABASE_URL = container.getConnectionUri()
  // a stable secret for collab-token HMAC (32 bytes base64).
  process.env.PARCHMENT_SECRET_KEY ??= Buffer.alloc(32, 7).toString('base64')

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
  const ed = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('ed@p.local','Ed','editor') RETURNING id",
  )
  editorUserId = ed.rows[0]?.id ?? ''
  const vw = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('vw@p.local','Vw','editor') RETURNING id",
  )
  viewerUserId = vw.rows[0]?.id ?? ''
  const doc = await c.query<{ id: string }>(
    `INSERT INTO documents (title, owner_id, markdown) VALUES ('Doc', $1, 'hi\n') RETURNING id`,
    [ownerId],
  )
  docId = doc.rows[0]?.id ?? ''
  const other = await c.query<{ id: string }>(
    `INSERT INTO documents (title, owner_id, markdown) VALUES ('Other', $1, 'x\n') RETURNING id`,
    [ownerId],
  )
  otherDocId = other.rows[0]?.id ?? ''
  // Grant ed an editor ACL on docId, vw only a viewer ACL.
  await c.query(
    "INSERT INTO document_permissions (doc_id, user_id, role, granted_by) VALUES ($1,$2,'editor',$3)",
    [docId, editorUserId, ownerId],
  )
  await c.query(
    "INSERT INTO document_permissions (doc_id, user_id, role, granted_by) VALUES ($1,$2,'viewer',$3)",
    [docId, viewerUserId, ownerId],
  )
  await c.end()
}, 180_000)

afterAll(async () => {
  await container?.stop()
})

describe('collab onAuthenticate decision (authorizeCollab)', () => {
  it('rejects a connection with NO token', async () => {
    const { authorizeCollab } = await import('@/lib/collab/authorize')
    expect(await authorizeCollab(undefined, docId)).toBe(false)
    expect(await authorizeCollab('', docId)).toBe(false)
  })

  it('accepts a valid non-expired EDIT share token for the doc', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { authorizeCollab } = await import('@/lib/collab/authorize')
    const edit = await createShare(ownerId, docId, { permission: 'edit' })
    expect(await authorizeCollab(edit.token, docId)).toBe(true)
  })

  it('rejects a VIEW share token (canView but NOT canEdit)', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { authorizeCollab } = await import('@/lib/collab/authorize')
    const view = await createShare(ownerId, docId, { permission: 'view' })
    expect(await authorizeCollab(view.token, docId)).toBe(false)
  })

  it('rejects an EXPIRED edit share token (bar #6 at the WS layer)', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { authorizeCollab } = await import('@/lib/collab/authorize')
    const expired = await createShare(ownerId, docId, {
      permission: 'edit',
      expiresAt: new Date(Date.now() - 60_000),
    })
    expect(await authorizeCollab(expired.token, docId)).toBe(false)
  })

  it('rejects an EDIT share token whose doc != documentName (cross-doc IDOR)', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { authorizeCollab } = await import('@/lib/collab/authorize')
    const editOther = await createShare(ownerId, otherDocId, { permission: 'edit' })
    // The token is for otherDocId, but the connection asks for docId → reject.
    expect(await authorizeCollab(editOther.token, docId)).toBe(false)
  })

  it('accepts a minted session collab-token for an editor; rejects it for a viewer', async () => {
    const { mintCollabToken } = await import('@/lib/collab/token')
    const { authorizeCollab } = await import('@/lib/collab/authorize')

    const edToken = mintCollabToken({ userId: editorUserId, docId }, 60)
    expect(await authorizeCollab(edToken, docId)).toBe(true)

    const vwToken = mintCollabToken({ userId: viewerUserId, docId }, 60)
    expect(await authorizeCollab(vwToken, docId)).toBe(false)
  })

  it('rejects a minted token whose docId != documentName', async () => {
    const { mintCollabToken } = await import('@/lib/collab/token')
    const { authorizeCollab } = await import('@/lib/collab/authorize')
    const edToken = mintCollabToken({ userId: editorUserId, docId }, 60)
    expect(await authorizeCollab(edToken, otherDocId)).toBe(false)
  })

  it('rejects an EXPIRED minted token', async () => {
    const { mintCollabToken } = await import('@/lib/collab/token')
    const { authorizeCollab } = await import('@/lib/collab/authorize')
    const edToken = mintCollabToken({ userId: editorUserId, docId }, -1) // already expired
    expect(await authorizeCollab(edToken, docId)).toBe(false)
  })

  it('rejects a tampered minted token', async () => {
    const { mintCollabToken } = await import('@/lib/collab/token')
    const { authorizeCollab } = await import('@/lib/collab/authorize')
    const edToken = mintCollabToken({ userId: editorUserId, docId }, 60)
    const tampered = `${edToken.slice(0, -2)}xy`
    expect(await authorizeCollab(tampered, docId)).toBe(false)
  })
})

describe('POST /api/collab-token (mint route)', () => {
  function patReq(token: string | null, docIdArg: string | null) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (token) headers.authorization = `Bearer ${token}`
    return new NextRequest('http://x/api/collab-token', {
      method: 'POST',
      headers,
      body: JSON.stringify(docIdArg === null ? {} : { docId: docIdArg }),
    })
  }

  it('an editor PAT mints a token; a viewer PAT is 403; no auth is 401', async () => {
    const { issuePat } = await import('@/lib/auth/pat')
    const { POST } = await import('@/app/api/collab-token/route')
    const edToken = (await issuePat(editorUserId, 'ed')).token
    const vwToken = (await issuePat(viewerUserId, 'vw')).token

    const noAuth = await POST(patReq(null, docId))
    expect(noAuth.status).toBe(401)

    const viewerRes = await POST(patReq(vwToken, docId))
    expect(viewerRes.status).toBe(403)

    const editorRes = await POST(patReq(edToken, docId))
    expect(editorRes.status).toBe(200)
    const data = (await editorRes.json()) as { token: string }
    expect(typeof data.token).toBe('string')

    // The minted token authorizes the collab handshake for this doc.
    const { authorizeCollab } = await import('@/lib/collab/authorize')
    expect(await authorizeCollab(data.token, docId)).toBe(true)
  })
})
