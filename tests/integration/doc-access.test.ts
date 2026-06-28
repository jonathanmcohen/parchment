import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// H Task 8 — verify H's call-sites against A's canonical getDocAccess from
// @/lib/authz/doc-access. H adds NO authz implementation; these assertions pin the
// contract H depends on: a share-grant's role maps to the right capability set and
// NEVER grants canManage. (bar #5 at the capability layer.)

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
    `INSERT INTO documents (title, owner_id, markdown) VALUES ('Doc', $1, 'hi\n') RETURNING id`,
    [ownerId],
  )
  docId = doc.rows[0]?.id ?? ''
  await c.end()
}, 180_000)

afterAll(async () => {
  await container?.stop()
})

describe("getDocAccess (A's module) — H's share-grant call-site contract", () => {
  it('viewer grant → only canView', async () => {
    const { getDocAccess } = await import('@/lib/authz/doc-access')
    const a = await getDocAccess({ shareGrant: { role: 'viewer' } }, docId)
    expect(a).toEqual({ canView: true, canComment: false, canEdit: false, canManage: false })
  })

  it('commenter grant → canView + canComment', async () => {
    const { getDocAccess } = await import('@/lib/authz/doc-access')
    const a = await getDocAccess({ shareGrant: { role: 'commenter' } }, docId)
    expect(a).toEqual({ canView: true, canComment: true, canEdit: false, canManage: false })
  })

  it('editor grant → +canEdit, never canManage', async () => {
    const { getDocAccess } = await import('@/lib/authz/doc-access')
    const a = await getDocAccess({ shareGrant: { role: 'editor' } }, docId)
    expect(a).toEqual({ canView: true, canComment: true, canEdit: true, canManage: false })
  })

  it('no user + no grant → all false', async () => {
    const { getDocAccess } = await import('@/lib/authz/doc-access')
    const a = await getDocAccess({}, docId)
    expect(a).toEqual({ canView: false, canComment: false, canEdit: false, canManage: false })
  })

  it('resolveShareGrant → getDocAccess composes end-to-end (an edit token grants canEdit)', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { resolveShareGrant } = await import('@/lib/docs/share-grant')
    const { getDocAccess } = await import('@/lib/authz/doc-access')
    const edit = await createShare(ownerId, docId, { permission: 'edit' })
    const grant = await resolveShareGrant(edit.token, null)
    expect(grant).not.toBeNull()
    const a = await getDocAccess({ shareGrant: grant }, docId)
    expect(a.canEdit).toBe(true)
    expect(a.canManage).toBe(false)
  })
})
