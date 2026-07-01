import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// v0.2.7 #4b: the picked-Google-fonts setting. Asserts the real upsert + the
// allow-list filtering on read AND write (a forged family can never be stored).

let container: StartedPostgreSqlContainer
let ownerId: string
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
  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

describe('picked Google fonts setting (v0.2.7 #4b)', () => {
  it('adds, de-dupes, allow-list-gates, and removes', async () => {
    const { addGoogleFont, getGoogleFonts, removeGoogleFont } = await import(
      '@/lib/docs/settings-repo'
    )

    expect(await getGoogleFonts(ownerId)).toEqual([])

    await addGoogleFont(ownerId, 'Inter')
    await addGoogleFont(ownerId, 'Lora')
    await addGoogleFont(ownerId, 'Inter') // dup → no-op
    expect(await getGoogleFonts(ownerId)).toEqual(['Inter', 'Lora'])

    // SSRF allow-list: a non-catalogue family is rejected (never stored).
    await addGoogleFont(ownerId, 'Evil; rm -rf')
    expect(await getGoogleFonts(ownerId)).toEqual(['Inter', 'Lora'])

    await removeGoogleFont(ownerId, 'Inter')
    expect(await getGoogleFonts(ownerId)).toEqual(['Lora'])
  })
})
