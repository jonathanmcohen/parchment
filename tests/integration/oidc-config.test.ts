// Task 3.1 — OIDC provider config store. Asserts the client secret is encrypted at
// rest (stored value ≠ plaintext, decrypts back), getOidcConfigForDisplay() returns
// the mask and never the plaintext, and the unchanged-secret / clear-secret paths.
//
// REQUIRES A LIVE DOCKER DAEMON (Testcontainers). PARCHMENT_SECRET_KEY from setup.ts.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let container: StartedPostgreSqlContainer
let url: string
const migrationsDir = path.resolve('src/db/migrations')

async function client(): Promise<Client> {
  const c = new Client({ connectionString: url })
  await c.connect()
  return c
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('parchment')
    .withUsername('parchment')
    .withPassword('parchment')
    .start()
  url = container.getConnectionUri()
  const c = await client()
  for (const f of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  await c.end()
  process.env.DATABASE_URL = url
}, 180_000)

afterAll(async () => {
  const { closeDb } = await import('@/db')
  await closeDb()
  await container?.stop()
})

beforeEach(async () => {
  const c = await client()
  await c.query("delete from app_config where key='oidc'")
  await c.end()
})

const SECRET = 'super-secret-oidc-client-value-123'

describe('Task 3.1 — OIDC config store', () => {
  it('persists clientSecretEnc that is NOT the plaintext and decrypts back', async () => {
    const { saveOidcConfig, getOidcConfig } = await import('@/lib/auth/oidc-config')
    await saveOidcConfig({
      enabled: true,
      issuerUrl: 'https://idp.example.com',
      clientId: 'client-1',
      clientSecret: SECRET,
    })

    // Raw column value (the whole JSON is itself encrypted by config/repo).
    const c = await client()
    const { rows } = await c.query<{ value: string }>(
      "select value from app_config where key='oidc'",
    )
    await c.end()
    const raw = rows[0]?.value ?? ''
    expect(raw).not.toContain(SECRET) // plaintext never present at rest

    // getOidcConfig decrypts the inner clientSecretEnc back to the plaintext.
    const cfg = await getOidcConfig()
    expect(cfg?.clientSecret).toBe(SECRET)
    expect(cfg?.issuerUrl).toBe('https://idp.example.com')
    expect(cfg?.enabled).toBe(true)
  })

  it('getOidcConfigForDisplay returns the mask, never the plaintext', async () => {
    const { saveOidcConfig, getOidcConfigForDisplay } = await import('@/lib/auth/oidc-config')
    await saveOidcConfig({
      enabled: true,
      issuerUrl: 'https://idp.example.com',
      clientId: 'client-1',
      clientSecret: SECRET,
    })
    const display = await getOidcConfigForDisplay()
    expect(display.hasSecret).toBe(true)
    expect(display.secretMask).toBe('••••••••')
    const serialized = JSON.stringify(display)
    expect(serialized).not.toContain(SECRET)
  })

  it('saving with the mask leaves the stored secret unchanged', async () => {
    const { saveOidcConfig, getOidcConfig } = await import('@/lib/auth/oidc-config')
    await saveOidcConfig({
      enabled: true,
      issuerUrl: 'https://idp.example.com',
      clientId: 'client-1',
      clientSecret: SECRET,
    })
    // Re-save with the mask (the user did not change the password field).
    await saveOidcConfig({
      enabled: false,
      issuerUrl: 'https://idp.example.com',
      clientId: 'client-1',
      clientSecret: '••••••••',
    })
    const cfg = await getOidcConfig()
    expect(cfg?.clientSecret).toBe(SECRET) // preserved
    expect(cfg?.enabled).toBe(false) // other fields updated
  })

  it('saving with an empty string clears the stored secret', async () => {
    const { saveOidcConfig, getOidcConfig, getOidcConfigForDisplay } = await import(
      '@/lib/auth/oidc-config'
    )
    await saveOidcConfig({
      enabled: true,
      issuerUrl: 'https://idp.example.com',
      clientId: 'client-1',
      clientSecret: SECRET,
    })
    await saveOidcConfig({
      enabled: true,
      issuerUrl: 'https://idp.example.com',
      clientId: 'client-1',
      clientSecret: '',
    })
    expect((await getOidcConfig())?.clientSecret).toBe('')
    expect((await getOidcConfigForDisplay()).hasSecret).toBe(false)
  })

  it('isOidcEnabled requires enabled + issuer + clientId + secret', async () => {
    const { saveOidcConfig, isOidcEnabled } = await import('@/lib/auth/oidc-config')
    // missing secret → not enabled
    await saveOidcConfig({
      enabled: true,
      issuerUrl: 'https://idp.example.com',
      clientId: 'client-1',
      clientSecret: '',
    })
    expect(await isOidcEnabled()).toBe(false)
    // full + enabled → enabled
    await saveOidcConfig({
      enabled: true,
      issuerUrl: 'https://idp.example.com',
      clientId: 'client-1',
      clientSecret: SECRET,
    })
    expect(await isOidcEnabled()).toBe(true)
    // disabled → not enabled even with all fields
    await saveOidcConfig({
      enabled: false,
      issuerUrl: 'https://idp.example.com',
      clientId: 'client-1',
      clientSecret: '••••••••',
    })
    expect(await isOidcEnabled()).toBe(false)
  })
})
