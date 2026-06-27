import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { NextRequest } from 'next/server'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A4 Task 6 (§7e/§7f/§7g): route-level authorization sweep against a real Postgres.
// Verifies authorizeDocRoute enforcement (viewer can't write, stranger → 404 with
// no existence leak), sub-resource IDOR (childId belonging to another doc → 404),
// and the folder-ownership IDOR guard on move. The DOC_ROUTE_REGISTRY is a CLOSED
// enumeration: CI fails if a /api/docs/* route is wired without a registry entry.

// Every /api/docs/* route MUST have an entry here. CI fails if a route is missing.
const DOC_ROUTE_REGISTRY = [
  'GET  /api/docs/[id]', // view → authorizeDocRoute('view')
  'PUT  /api/docs/[id]', // edit → authorizeDocRoute('edit')
  'DELETE /api/docs/[id]', // manage → authorizeDocRoute('manage') or owner+ownerId
  'GET  /api/docs/bulk', // owner-scoped (ownerId); no ACL share applies to bulk list
  'POST /api/docs/bulk', // owner-scoped (ownerId)
  'GET  /api/docs/[id]/versions', // view → resolveDocAccess('view')
  'POST /api/docs/[id]/versions', // edit → resolveDocAccess('edit')
  'GET  /api/docs/[id]/versions/[versionId]', // view + IDOR docId check
  'POST /api/docs/[id]/versions/[versionId]/restore', // manage + IDOR docId check
  'GET  /api/docs/[id]/comments', // view → resolveDocAccess('view')
  'POST /api/docs/[id]/comments', // comment → resolveDocAccess('comment')
  'PATCH /api/docs/[id]/comments/[commentId]', // comment or manage + IDOR docId check
  'DELETE /api/docs/[id]/comments/[commentId]', // manage + IDOR docId check
  'GET  /api/docs/[id]/permissions', // manage → authorizeDocRoute('manage')
  'POST /api/docs/[id]/permissions', // manage → authorizeDocRoute('manage')
  'DELETE /api/docs/[id]/permissions', // manage → authorizeDocRoute('manage')
  'GET  /api/docs/[id]/watermark', // owner-only (ownerId, not ACL — intentional: author feature)
  'PUT  /api/docs/[id]/watermark', // owner-only (ownerId — intentional: author feature)
  'GET  /api/docs/[id]/custom-css', // owner-only (ownerId — intentional: author feature)
  'PUT  /api/docs/[id]/custom-css', // owner-only (ownerId — intentional: author feature)
  'POST /api/export/doc/[id]', // view → resolveDocAccess('view') before export
  'POST /api/export/bulk', // owner-scoped (ownerId); bulk export is personal
  'POST /api/docs/[id]/move', // manage + §7g folder-ownership IDOR guard
] as const

let container: StartedPostgreSqlContainer
const migrationsDir = path.resolve('src/db/migrations')

let ownerId = ''
let viewerId = ''
let editorId = ''
let commenterId = ''
let strangerId = ''
let docId = ''
let otherDocId = ''
let otherVersionId = ''
let otherCommentId = ''
let ownerFolderId = ''
let otherUserFolderId = ''

let ownerToken = ''
let viewerToken = ''
let editorToken = ''
let commenterToken = ''
let strangerToken = ''

function bearer(token: string): NextRequest {
  return new NextRequest(`http://x/api/docs/${docId}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  })
}
function bearerJson(token: string, body: string, method = 'POST'): NextRequest {
  return new NextRequest(`http://x/api/docs/${docId}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body,
  })
}

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

  const mkUser = async (email: string, role: string) => {
    const r = await c.query<{ id: string }>(
      'INSERT INTO users (email, name, role) VALUES ($1,$2,$3) RETURNING id',
      [email, email.split('@')[0], role],
    )
    return r.rows[0]!.id
  }
  ownerId = await mkUser('owner@p.local', 'owner')
  viewerId = await mkUser('viewer@p.local', 'editor')
  editorId = await mkUser('editor@p.local', 'editor')
  commenterId = await mkUser('commenter@p.local', 'editor')
  strangerId = await mkUser('stranger@p.local', 'editor')

  const mkDoc = async (owner: string, title: string) => {
    const r = await c.query<{ id: string }>(
      "INSERT INTO documents (title, owner_id, markdown) VALUES ($1,$2,'hi\n') RETURNING id",
      [title, owner],
    )
    return r.rows[0]!.id
  }
  docId = await mkDoc(ownerId, 'Owner Doc')
  otherDocId = await mkDoc(strangerId, 'Stranger Doc')

  // grants on docId
  await c.query(
    "INSERT INTO document_permissions (doc_id, user_id, role, granted_by) VALUES ($1,$2,'viewer',$3)",
    [docId, viewerId, ownerId],
  )
  await c.query(
    "INSERT INTO document_permissions (doc_id, user_id, role, granted_by) VALUES ($1,$2,'editor',$3)",
    [docId, editorId, ownerId],
  )
  await c.query(
    "INSERT INTO document_permissions (doc_id, user_id, role, granted_by) VALUES ($1,$2,'commenter',$3)",
    [docId, commenterId, ownerId],
  )

  // a version + a comment on the OTHER doc (for IDOR cross-doc fetches via docId)
  const ver = await c.query<{ id: string }>(
    "INSERT INTO doc_versions (doc_id, kind, markdown) VALUES ($1,'named','v\n') RETURNING id",
    [otherDocId],
  )
  otherVersionId = ver.rows[0]!.id
  const com = await c.query<{ id: string }>(
    "INSERT INTO comments (doc_id, thread_id, body) VALUES ($1, gen_random_uuid(), 'c') RETURNING id",
    [otherDocId],
  )
  otherCommentId = com.rows[0]!.id
  // fix thread_id = id for the root comment
  await c.query('UPDATE comments SET thread_id = id WHERE id = $1', [otherCommentId])

  // folders: one owned by owner, one owned by stranger (for §7g move IDOR)
  const mkFolder = async (owner: string, name: string) => {
    const r = await c.query<{ id: string }>(
      'INSERT INTO folders (name, owner_id) VALUES ($1,$2) RETURNING id',
      [name, owner],
    )
    return r.rows[0]!.id
  }
  ownerFolderId = await mkFolder(ownerId, 'Owner Folder')
  otherUserFolderId = await mkFolder(strangerId, 'Stranger Folder')

  await c.end()
  process.env.DATABASE_URL = url

  // mint PATs via the real issuer
  const { issuePat } = await import('@/lib/auth/pat')
  ownerToken = (await issuePat(ownerId, 'owner-pat')).token
  viewerToken = (await issuePat(viewerId, 'viewer-pat')).token
  editorToken = (await issuePat(editorId, 'editor-pat')).token
  commenterToken = (await issuePat(commenterId, 'commenter-pat')).token
  strangerToken = (await issuePat(strangerId, 'stranger-pat')).token
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('A4 — doc-route authorization', () => {
  it('DOC_ROUTE_REGISTRY covers every /api/docs/* route (CI sentinel)', () => {
    // This count MUST be updated when a new /api/docs/* route is added.
    expect(DOC_ROUTE_REGISTRY.length).toBe(23)
  })

  it('GET /api/docs/:id — viewer-with-grant can read, stranger gets 404', async () => {
    const { GET } = await import('@/app/api/docs/[id]/route')
    const ctx = { params: Promise.resolve({ id: docId }) }
    const okRes = await GET(bearer(viewerToken), ctx)
    expect(okRes.status).toBe(200)
    const denyRes = await GET(bearer(strangerToken), ctx)
    expect(denyRes.status).toBe(404) // no existence leak
  })

  it('PUT /api/docs/:id — a VIEWER grant cannot write (404), an EDITOR grant can (204)', async () => {
    const { PUT } = await import('@/app/api/docs/[id]/route')
    const ctx = { params: Promise.resolve({ id: docId }) }
    const body = JSON.stringify({ contentJson: {}, markdown: 'x' })
    const viewerPut = await PUT(bearerJson(viewerToken, body, 'PUT'), ctx)
    expect(viewerPut.status).toBe(404) // view grant ≠ edit
    const editorPut = await PUT(bearerJson(editorToken, body, 'PUT'), ctx)
    expect(editorPut.status).toBe(204)
  })

  it('DELETE /api/docs/:id — stranger 404, owner 204', async () => {
    const { DELETE } = await import('@/app/api/docs/[id]/route')
    // use a throwaway doc so we don't destroy docId for later tests
    const { db, schema } = await import('@/db')
    const [tmp] = await db
      .insert(schema.documents)
      .values({ title: 'del', ownerId, markdown: 'x' })
      .returning({ id: schema.documents.id })
    const ctx = { params: Promise.resolve({ id: tmp!.id }) }
    const denied = await DELETE(bearer(strangerToken), ctx)
    expect(denied.status).toBe(404)
    const ok = await DELETE(bearer(ownerToken), ctx)
    expect(ok.status).toBe(204)
  })

  it('GET /api/docs/[id]/versions — stranger 404, viewer-grant 200', async () => {
    const { GET } = await import('@/app/api/docs/[id]/versions/route')
    const ctx = { params: Promise.resolve({ id: docId }) }
    expect((await GET(bearer(strangerToken), ctx)).status).toBe(404)
    expect((await GET(bearer(viewerToken), ctx)).status).toBe(200)
  })

  it('POST /api/docs/[id]/versions — viewer-grant 404 (view≠edit), editor-grant 201', async () => {
    const { POST } = await import('@/app/api/docs/[id]/versions/route')
    const ctx = { params: Promise.resolve({ id: docId }) }
    const body = JSON.stringify({ kind: 'auto' })
    expect((await POST(bearerJson(viewerToken, body), ctx)).status).toBe(404)
    expect((await POST(bearerJson(editorToken, body), ctx)).status).toBe(201)
  })

  it('IDOR: GET /api/docs/[id]/versions/[versionId] returns 404 when versionId belongs to a different doc', async () => {
    const { GET } = await import('@/app/api/docs/[id]/versions/[versionId]/route')
    const ctx = { params: Promise.resolve({ id: docId, versionId: otherVersionId }) }
    const res = await GET(bearer(ownerToken), ctx)
    expect(res.status).toBe(404)
  })

  it('IDOR: POST /api/docs/[id]/versions/[versionId]/restore returns 404 when versionId belongs to a different doc', async () => {
    const { POST } = await import('@/app/api/docs/[id]/versions/[versionId]/restore/route')
    const ctx = { params: Promise.resolve({ id: docId, versionId: otherVersionId }) }
    const res = await POST(bearer(ownerToken), ctx)
    expect(res.status).toBe(404)
  })

  it('GET /api/docs/[id]/comments — stranger 404, viewer-grant 200', async () => {
    const { GET } = await import('@/app/api/docs/[id]/comments/route')
    const ctx = { params: Promise.resolve({ id: docId }) }
    expect((await GET(bearer(strangerToken), ctx)).status).toBe(404)
    expect((await GET(bearer(viewerToken), ctx)).status).toBe(200)
  })

  it('POST /api/docs/[id]/comments — viewer-grant 404 (view≠comment), commenter-grant 201', async () => {
    const { POST } = await import('@/app/api/docs/[id]/comments/route')
    const ctx = { params: Promise.resolve({ id: docId }) }
    const body = JSON.stringify({ body: 'a comment' })
    expect((await POST(bearerJson(viewerToken, body), ctx)).status).toBe(404)
    expect((await POST(bearerJson(commenterToken, body), ctx)).status).toBe(201)
  })

  it('IDOR: DELETE /api/docs/[id]/comments/[commentId] returns 404 when commentId belongs to a different doc', async () => {
    const { PATCH } = await import('@/app/api/docs/[id]/comments/[commentId]/route')
    const ctx = { params: Promise.resolve({ id: docId, commentId: otherCommentId }) }
    const res = await PATCH(bearerJson(ownerToken, JSON.stringify({ deleted: true }), 'PATCH'), ctx)
    expect(res.status).toBe(404)
    // and the foreign comment still exists (was not deleted across docs)
    const { db, schema } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    const rows = await db
      .select({ id: schema.comments.id })
      .from(schema.comments)
      .where(eq(schema.comments.id, otherCommentId))
    expect(rows.length).toBe(1)
  })

  it('watermark PUT is owner-only: owner 200, editor-grant (non-owner) 404', async () => {
    const { PUT } = await import('@/app/api/docs/[id]/watermark/route')
    const ctx = { params: Promise.resolve({ id: docId }) }
    const body = JSON.stringify({ watermark: { text: 'DRAFT' } })
    expect((await PUT(bearerJson(ownerToken, body, 'PUT'), ctx)).status).toBe(200)
    // a shared editor (non-owner) cannot override the author's watermark → 404
    expect((await PUT(bearerJson(editorToken, body, 'PUT'), ctx)).status).toBe(404)
  })

  it('custom-css PUT is owner-only: owner 200, editor-grant (non-owner) 404', async () => {
    const { PUT } = await import('@/app/api/docs/[id]/custom-css/route')
    const ctx = { params: Promise.resolve({ id: docId }) }
    const body = JSON.stringify({ css: 'p { color: red; }' })
    expect((await PUT(bearerJson(ownerToken, body, 'PUT'), ctx)).status).toBe(200)
    expect((await PUT(bearerJson(editorToken, body, 'PUT'), ctx)).status).toBe(404)
  })

  it('export (GET /api/docs/[id]/export) — stranger 404, viewer-grant 200', async () => {
    const { GET } = await import('@/app/api/docs/[id]/export/route')
    const mk = (token: string) =>
      new NextRequest(`http://x/api/docs/${docId}/export?format=md`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
      })
    const ctx = { params: Promise.resolve({ id: docId }) }
    expect((await GET(mk(strangerToken), ctx)).status).toBe(404)
    expect((await GET(mk(viewerToken), ctx)).status).toBe(200)
  })

  it('IDOR §7g: POST /api/docs/[id]/move returns 404 when folderId belongs to a different user', async () => {
    const { POST } = await import('@/app/api/docs/[id]/move/route')
    const ctx = { params: Promise.resolve({ id: docId }) }
    const res = await POST(
      bearerJson(ownerToken, JSON.stringify({ folderId: otherUserFolderId })),
      ctx,
    )
    expect(res.status).toBe(404)
    // owner moving into their OWN folder → 204
    const ok = await POST(bearerJson(ownerToken, JSON.stringify({ folderId: ownerFolderId })), ctx)
    expect(ok.status).toBe(204)
  })
})
