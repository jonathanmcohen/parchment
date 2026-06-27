import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { NextRequest } from 'next/server'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A4 Task 13: "Shared with me" listing — docs granted to a user via
// document_permissions (not owned by them), never their own, never ungranted.

let container: StartedPostgreSqlContainer
const migrationsDir = path.resolve('src/db/migrations')
let ownerId = ''
let viewerId = ''
let strangerId = ''
let docId = ''

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
  const mk = async (email: string, role: string) => {
    const r = await c.query<{ id: string }>(
      'INSERT INTO users (email, name, role) VALUES ($1,$2,$3) RETURNING id',
      [email, email.split('@')[0], role],
    )
    return r.rows[0]!.id
  }
  ownerId = await mk('owner@p.local', 'owner')
  viewerId = await mk('viewer@p.local', 'editor')
  strangerId = await mk('stranger@p.local', 'editor')
  const r = await c.query<{ id: string }>(
    "INSERT INTO documents (title, owner_id, markdown) VALUES ('OwnerDoc',$1,'hi\n') RETURNING id",
    [ownerId],
  )
  docId = r.rows[0]!.id
  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('A4 — Shared-with-me listing', () => {
  it('listSharedWithMe returns docs granted to the user, never their own, never ungranted', async () => {
    const repo = await import('@/lib/docs/repo')
    const permRepo = await import('@/lib/docs/doc-permissions-repo')
    // grant viewerId a viewer role on ownerDoc
    await permRepo.grantDocPermission({
      docId,
      userId: viewerId,
      role: 'viewer',
      grantedBy: ownerId,
    })
    const shared = await repo.listSharedWithMe(viewerId)
    expect(shared.map((d) => d.id)).toContain(docId)
    // owner does not see their own doc in "shared with me"
    const ownerShared = await repo.listSharedWithMe(ownerId)
    expect(ownerShared.map((d) => d.id)).not.toContain(docId)
    // a stranger sees nothing
    expect((await repo.listSharedWithMe(strangerId)).length).toBe(0)
  })

  it('GET /api/docs/shared returns the granted doc for the viewer and nothing for a stranger', async () => {
    const { GET } = await import('@/app/api/docs/shared/route')
    const { issuePat } = await import('@/lib/auth/pat')
    const viewerToken = (await issuePat(viewerId, 'v')).token
    const strangerToken = (await issuePat(strangerId, 's')).token
    const mk = (token: string) =>
      new NextRequest('http://x/api/docs/shared', {
        headers: { authorization: `Bearer ${token}` },
      })

    const vRes = await GET(mk(viewerToken))
    expect(vRes.status).toBe(200)
    const vBody = (await vRes.json()) as Array<{ id: string; size: number; preview: string }>
    expect(vBody.map((d) => d.id)).toContain(docId)
    // rich row shape the FileManager renderer needs
    expect(typeof vBody[0]?.size).toBe('number')
    expect(typeof vBody[0]?.preview).toBe('string')

    const sRes = await GET(mk(strangerToken))
    const sBody = (await sRes.json()) as unknown[]
    expect(sBody.length).toBe(0)
  })

  it('the editor-page gate (resolveDocAccess view) opens for a viewer grant, 404s a stranger', async () => {
    const { resolveDocAccess } = await import('@/lib/authz/doc-access')
    const usersRepo = await import('@/lib/auth/users-repo')
    const viewer = (await usersRepo.getUser(viewerId))!
    const stranger = (await usersRepo.getUser(strangerId))!
    // SessionUser shape — resolveDocAccess only reads id + role
    expect(await resolveDocAccess(viewer as never, docId, 'view')).not.toBeNull()
    expect(await resolveDocAccess(stranger as never, docId, 'view')).toBeNull()
  })
})
