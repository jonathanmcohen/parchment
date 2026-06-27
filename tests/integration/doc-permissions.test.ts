import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { NextRequest } from 'next/server'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A4 Task 7: document_permissions repo (CRUD, doc-scoping, upsert) + the manage-
// gated ACL REST endpoint against a real Postgres.

let container: StartedPostgreSqlContainer
const migrationsDir = path.resolve('src/db/migrations')

let ownerId = ''
let viewerId = ''
let editorId = ''
let strangerId = ''
let docId = ''
let otherDocId = ''
let ownerToken = ''
let editorToken = ''

function bearer(token: string): NextRequest {
  return new NextRequest(`http://x/api/docs/${docId}/permissions`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  })
}
function bearerJson(token: string, body: string, method = 'POST'): NextRequest {
  return new NextRequest(`http://x/api/docs/${docId}/permissions`, {
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
  strangerId = await mkUser('stranger@p.local', 'editor')
  const mkDoc = async (owner: string, title: string) => {
    const r = await c.query<{ id: string }>(
      "INSERT INTO documents (title, owner_id, markdown) VALUES ($1,$2,'hi\n') RETURNING id",
      [title, owner],
    )
    return r.rows[0]!.id
  }
  docId = await mkDoc(ownerId, 'Owner Doc')
  otherDocId = await mkDoc(ownerId, 'Other Doc')
  // editorId gets an EDITOR doc-grant on docId — proves editor-grant ≠ manage.
  await c.query(
    "INSERT INTO document_permissions (doc_id, user_id, role, granted_by) VALUES ($1,$2,'editor',$3)",
    [docId, editorId, ownerId],
  )
  await c.end()
  process.env.DATABASE_URL = url

  const { issuePat } = await import('@/lib/auth/pat')
  ownerToken = (await issuePat(ownerId, 'owner-pat')).token
  editorToken = (await issuePat(editorId, 'editor-pat')).token
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('A4 — document_permissions repo', () => {
  it('grant → list → setRole → revoke round-trips and is doc-scoped', async () => {
    const repo = await import('@/lib/docs/doc-permissions-repo')

    await repo.grantDocPermission({ docId, userId: viewerId, role: 'viewer', grantedBy: ownerId })
    let perms = await repo.listDocPermissions(docId)
    expect(perms.map((p) => p.userId)).toContain(viewerId)
    expect(perms.find((p) => p.userId === viewerId)?.role).toBe('viewer')

    await repo.setDocPermission(docId, viewerId, 'editor')
    expect((await repo.getDocPermission(docId, viewerId))?.role).toBe('editor')

    // grant on a DIFFERENT doc does not leak into this doc's list
    await repo.grantDocPermission({
      docId: otherDocId,
      userId: viewerId,
      role: 'viewer',
      grantedBy: ownerId,
    })
    perms = await repo.listDocPermissions(docId)
    // docId has viewerId + editorId (seeded) = 2 grants; otherDocId's grant excluded
    expect(perms.filter((p) => p.userId === viewerId).length).toBe(1)

    await repo.revokeDocPermission(docId, viewerId)
    expect(await repo.getDocPermission(docId, viewerId)).toBeNull()
  })

  it('granting an existing (doc,user) updates the role (upsert), not a duplicate', async () => {
    const repo = await import('@/lib/docs/doc-permissions-repo')
    await repo.grantDocPermission({ docId, userId: strangerId, role: 'viewer', grantedBy: ownerId })
    await repo.grantDocPermission({ docId, userId: strangerId, role: 'editor', grantedBy: ownerId })
    const list = await repo.listDocPermissions(docId)
    expect(list.filter((p) => p.userId === strangerId).length).toBe(1)
    expect((await repo.getDocPermission(docId, strangerId))?.role).toBe('editor')
    await repo.revokeDocPermission(docId, strangerId)
  })

  it('ACL route requires manage: owner can grant, editor-grant user gets 404', async () => {
    const { POST, GET, DELETE } = await import('@/app/api/docs/[id]/permissions/route')
    const ctx = { params: Promise.resolve({ id: docId }) }

    // owner grants stranger a viewer role
    const grant = await POST(
      bearerJson(ownerToken, JSON.stringify({ userId: strangerId, role: 'viewer' })),
      ctx,
    )
    expect(grant.status).toBe(201)

    // a user with only an EDITOR doc-grant cannot manage sharing
    const denied = await POST(
      bearerJson(editorToken, JSON.stringify({ userId: strangerId, role: 'editor' })),
      ctx,
    )
    expect(denied.status).toBe(404) // manage denied → 404, no existence leak

    // list (manage) by owner returns the grant
    const list = await GET(bearer(ownerToken), ctx)
    expect(list.status).toBe(200)
    const body = (await list.json()) as { permissions: { userId: string }[] }
    expect(body.permissions.some((p) => p.userId === strangerId)).toBe(true)

    // cannot grant a doc-role above 'editor' (no 'admin'/'owner' doc-roles exist)
    const bad = await POST(
      bearerJson(ownerToken, JSON.stringify({ userId: strangerId, role: 'owner' })),
      ctx,
    )
    expect(bad.status).toBe(400)

    // cannot grant the doc OWNER a (lesser) role on their own doc (IDOR guard)
    const self = await POST(
      bearerJson(ownerToken, JSON.stringify({ userId: ownerId, role: 'viewer' })),
      ctx,
    )
    expect(self.status).toBe(400)

    // owner revokes
    const del = await DELETE(
      bearerJson(ownerToken, JSON.stringify({ userId: strangerId }), 'DELETE'),
      ctx,
    )
    expect(del.status).toBe(204)
  })

  it('GET /api/users/pickable excludes the caller, omits hashes/disabledAt/role, and hides disabled users', async () => {
    const { GET } = await import('@/app/api/users/pickable/route')
    const { db, schema } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    // disable the stranger so it must NOT appear in the directory
    await db
      .update(schema.users)
      .set({ disabledAt: new Date() })
      .where(eq(schema.users.id, strangerId))

    const req = new NextRequest('http://x/api/users/pickable', {
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      users: Array<Record<string, unknown>>
    }
    // caller (owner) excluded; disabled stranger excluded
    expect(body.users.some((u) => u.id === ownerId)).toBe(false)
    expect(body.users.some((u) => u.id === strangerId)).toBe(false)
    // active editor/viewer present
    expect(body.users.some((u) => u.id === editorId)).toBe(true)
    // only safe columns — no hashes, no role, no disabledAt
    for (const u of body.users) {
      expect(Object.keys(u).sort()).toEqual(['email', 'id', 'name'])
    }
    // restore
    await db.update(schema.users).set({ disabledAt: null }).where(eq(schema.users.id, strangerId))
  })
})
