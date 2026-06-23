import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// G2: user template CRUD + createTemplateFromDoc ownership against real Postgres.

let container: StartedPostgreSqlContainer
let ownerId: string
let otherOwnerId: string
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

  const userRes = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('tpl@p.local','Template User','owner') RETURNING id",
  )
  ownerId = userRes.rows[0]?.id ?? ''

  const otherRes = await c.query<{ id: string }>(
    "INSERT INTO users (email, name, role) VALUES ('tpl-other@p.local','Other User','owner') RETURNING id",
  )
  otherOwnerId = otherRes.rows[0]?.id ?? ''

  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('G2 — templates repo', () => {
  it('createTemplate + listTemplates returns the created template (owner-scoped)', async () => {
    const { createTemplate, listTemplates } = await import('@/lib/docs/templates-repo')
    const content = { type: 'doc', content: [{ type: 'paragraph' }] }
    const { id } = await createTemplate(ownerId, {
      name: 'My Template',
      description: 'A description',
      content,
    })
    expect(id).toBeTruthy()

    const mine = await listTemplates(ownerId)
    const found = mine.find((t) => t.id === id)
    expect(found).toBeDefined()
    expect(found?.name).toBe('My Template')
    expect(found?.description).toBe('A description')
    expect(found?.content).toEqual(content)

    // not visible to another owner
    const theirs = await listTemplates(otherOwnerId)
    expect(theirs.find((t) => t.id === id)).toBeUndefined()
  })

  it('createTemplate rejects empty name', async () => {
    const { createTemplate } = await import('@/lib/docs/templates-repo')
    await expect(
      createTemplate(ownerId, { name: '', content: { type: 'doc', content: [] } }),
    ).rejects.toThrow('empty name')
    await expect(
      createTemplate(ownerId, { name: '   ', content: { type: 'doc', content: [] } }),
    ).rejects.toThrow('empty name')
  })

  it('createTemplateFromDoc copies the doc content', async () => {
    const { createDocument, saveDocument } = await import('@/lib/docs/repo')
    const { createTemplateFromDoc, getTemplateContent } = await import('@/lib/docs/templates-repo')
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    }
    const { id: docId } = await createDocument(ownerId, { title: 'Source Doc' })
    await saveDocument(docId, { contentJson: content, markdown: 'hello' })

    const { id: tplId } = await createTemplateFromDoc(ownerId, docId, 'From Doc')
    const copied = await getTemplateContent(ownerId, tplId)
    expect(copied).toEqual(content)
  })

  it('createTemplateFromDoc rejects a non-owned doc', async () => {
    const { createDocument } = await import('@/lib/docs/repo')
    const { createTemplateFromDoc } = await import('@/lib/docs/templates-repo')
    const { id: docId } = await createDocument(ownerId, { title: 'Owner Doc' })
    await expect(createTemplateFromDoc(otherOwnerId, docId, 'Sneaky')).rejects.toThrow('not found')
  })

  it('getTemplateContent is owner-scoped', async () => {
    const { createTemplate, getTemplateContent } = await import('@/lib/docs/templates-repo')
    const content = { type: 'doc', content: [{ type: 'paragraph' }] }
    const { id } = await createTemplate(ownerId, { name: 'Scoped', content })
    // owner gets the content
    expect(await getTemplateContent(ownerId, id)).toEqual(content)
    // another owner gets null
    expect(await getTemplateContent(otherOwnerId, id)).toBeNull()
  })

  it('deleteTemplate removes it (owner-scoped, cross-owner is a no-op)', async () => {
    const { createTemplate, deleteTemplate, listTemplates } = await import(
      '@/lib/docs/templates-repo'
    )
    const { id } = await createTemplate(ownerId, {
      name: 'Delete Me',
      content: { type: 'doc', content: [] },
    })
    // wrong owner — no-op
    await deleteTemplate(otherOwnerId, id)
    expect((await listTemplates(ownerId)).find((t) => t.id === id)).toBeDefined()
    // correct owner — removed
    await deleteTemplate(ownerId, id)
    expect((await listTemplates(ownerId)).find((t) => t.id === id)).toBeUndefined()
  })

  it('createDocument can instantiate from template content', async () => {
    const { createDocument, getDocument } = await import('@/lib/docs/repo')
    const content = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hi' }] }],
    }
    const { id } = await createDocument(ownerId, { title: 'From Template', content })
    const doc = await getDocument(id)
    expect(doc?.title).toBe('From Template')
    expect(doc?.content).toEqual(content)
  })
})
