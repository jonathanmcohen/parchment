import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// H Task 7 (integration) — resolveShareGrant(token, password) composes resolveShare
// (drops expired) + verifySharePassword, then maps permission → { role }. Returns
// null for missing/expired/wrong-password. Mirrors tests/integration/shares.test.ts.

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

describe('resolveShareGrant', () => {
  it('maps each permission level to the right role', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { resolveShareGrant } = await import('@/lib/docs/share-grant')

    const view = await createShare(ownerId, docId, { permission: 'view' })
    const comment = await createShare(ownerId, docId, { permission: 'comment' })
    const edit = await createShare(ownerId, docId, { permission: 'edit' })
    const suggest = await createShare(ownerId, docId, { permission: 'suggest' })

    expect(await resolveShareGrant(view.token, null)).toEqual({ role: 'viewer' })
    expect(await resolveShareGrant(comment.token, null)).toEqual({ role: 'commenter' })
    expect(await resolveShareGrant(edit.token, null)).toEqual({ role: 'editor' })
    expect(await resolveShareGrant(suggest.token, null)).toEqual({ role: 'editor' })
  })

  it('returns null for a missing token', async () => {
    const { resolveShareGrant } = await import('@/lib/docs/share-grant')
    expect(await resolveShareGrant('does-not-exist', null)).toBeNull()
  })

  it('returns null for an EXPIRED token (bar #6 at the resolution layer)', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { resolveShareGrant } = await import('@/lib/docs/share-grant')
    const past = new Date(Date.now() - 60_000)
    const expired = await createShare(ownerId, docId, { permission: 'comment', expiresAt: past })
    expect(await resolveShareGrant(expired.token, null)).toBeNull()
  })

  it('returns null for a password-protected token with no/wrong password, the grant with the right one', async () => {
    const { createShare } = await import('@/lib/docs/shares-repo')
    const { resolveShareGrant } = await import('@/lib/docs/share-grant')
    const pw = await createShare(ownerId, docId, { permission: 'edit', password: 's3cret' })
    expect(await resolveShareGrant(pw.token, null)).toBeNull()
    expect(await resolveShareGrant(pw.token, 'wrong')).toBeNull()
    expect(await resolveShareGrant(pw.token, 's3cret')).toEqual({ role: 'editor' })
  })
})
