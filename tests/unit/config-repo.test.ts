// Phase 0 Task 4b — unit tests for src/lib/config/repo.ts (the canonical ENCRYPTED
// app_config repo). Pure-unit: @/db and @/lib/crypto/secret-box are BOTH mocked, so
// there is no Testcontainers and no real crypto.
//
// TDD RED record: written BEFORE src/lib/config/repo.ts existed; all 10 tests failed
// ("Cannot find module '@/lib/config/repo'"). Now GREEN.
//
// The @/db mock is backed by a stateful in-memory Map keyed by `key`, so round-trip /
// overwrite / delete behave like a real upsert table. The secret-box mock uses a
// trivial reversible transform ('enc:' prefix) so encrypt→store→decrypt round-trips,
// and exposes a real DecryptError class + a switch to force decrypt failures.
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Stateful in-memory app_config backend + crypto switches (hoisted for vi.mock) ──
// MockDecryptError MUST live inside vi.hoisted: vi.mock factories are hoisted above
// top-level declarations, so a class declared in module scope is not yet initialised
// when the factory runs.
const { store, crypto, MockDecryptError } = vi.hoisted(() => {
  class MockDecryptError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'DecryptError'
    }
  }
  return {
    store: new Map<string, string>(),
    crypto: {
      failDecrypt: false, // when true, decryptSecret throws DecryptError
      failKey: false, // when true, encryptSecret throws (no key)
    },
    MockDecryptError,
  }
})

vi.mock('@/lib/crypto/secret-box', () => ({
  DecryptError: MockDecryptError,
  encryptSecret: (plain: string): string => {
    if (crypto.failKey) throw new Error('PARCHMENT_SECRET_KEY is not set')
    return `enc:${plain}`
  },
  decryptSecret: (envelope: string): string => {
    if (crypto.failDecrypt) throw new MockDecryptError('decryption failed')
    if (!envelope.startsWith('enc:')) throw new MockDecryptError('malformed envelope')
    return envelope.slice('enc:'.length)
  },
}))

vi.mock('@/db', () => ({
  schema: {
    appConfig: { key: 'app_config.key', value: 'app_config.value' },
  },
  db: {
    // getAppConfig: db.select({value}).from(appConfig).where(eq(key)).limit(1)
    select: () => ({
      from: () => ({
        where: (predicate: { __key?: string }) => ({
          limit: () => {
            const k = predicate?.__key
            const v = k !== undefined ? store.get(k) : undefined
            return Promise.resolve(v === undefined ? [] : [{ value: v }])
          },
        }),
      }),
    }),
    // setAppConfig: db.insert(appConfig).values({key,value,...}).onConflictDoUpdate({...})
    insert: () => ({
      values: (row: { key: string; value: string }) => ({
        onConflictDoUpdate: () => {
          store.set(row.key, row.value)
          return Promise.resolve()
        },
      }),
    }),
    // deleteAppConfig: db.delete(appConfig).where(eq(key))
    delete: () => ({
      where: (predicate: { __key?: string }) => {
        if (predicate?.__key !== undefined) store.delete(predicate.__key)
        return Promise.resolve()
      },
    }),
  },
}))

// drizzle's eq(col, val) — our mock only needs the value carried through so the
// where() stubs above can look up the in-memory store by key.
vi.mock('drizzle-orm', () => ({
  eq: (_col: unknown, val: string) => ({ __key: val }),
}))

import {
  deleteAppConfig,
  getAppConfig,
  getAppConfigJson,
  setAppConfig,
  setAppConfigJson,
} from '@/lib/config/repo'

beforeEach(() => {
  store.clear()
  crypto.failDecrypt = false
  crypto.failKey = false
})

describe('setAppConfig / getAppConfig — round-trip', () => {
  it('stores the encrypted value and retrieves the decrypted plaintext', async () => {
    await setAppConfig('smtp.password', 'hunter2')
    // stored form is the ENCRYPTED envelope, never the plaintext
    expect(store.get('smtp.password')).toBe('enc:hunter2')
    expect(await getAppConfig('smtp.password')).toBe('hunter2')
  })

  it('overwriting a key returns the latest value', async () => {
    await setAppConfig('k', 'first')
    await setAppConfig('k', 'second')
    expect(await getAppConfig('k')).toBe('second')
  })

  it('getAppConfig returns null for a missing key', async () => {
    expect(await getAppConfig('does-not-exist')).toBeNull()
  })
})

describe('setAppConfigJson / getAppConfigJson — round-trip', () => {
  it('serialises an object to JSON, encrypts, stores, retrieves, deserialises', async () => {
    const obj = { host: 'smtp.example.com', port: 587, secure: true }
    await setAppConfigJson('smtp.config', obj)
    expect(store.get('smtp.config')).toBe(`enc:${JSON.stringify(obj)}`)
    expect(await getAppConfigJson<typeof obj>('smtp.config')).toEqual(obj)
  })

  it('getAppConfigJson returns null for a missing key', async () => {
    expect(await getAppConfigJson('missing')).toBeNull()
  })

  it('getAppConfigJson returns null when decryptSecret throws (corrupt envelope)', async () => {
    await setAppConfigJson('smtp.config', { a: 1 })
    crypto.failDecrypt = true
    expect(await getAppConfigJson('smtp.config')).toBeNull()
  })
})

describe('deleteAppConfig', () => {
  it('removes the key so subsequent getAppConfig returns null', async () => {
    await setAppConfig('temp', 'value')
    expect(await getAppConfig('temp')).toBe('value')
    await deleteAppConfig('temp')
    expect(await getAppConfig('temp')).toBeNull()
  })
})

describe('decryption failure isolation', () => {
  it('getAppConfig returns null (not throws) when decryptSecret throws DecryptError', async () => {
    await setAppConfig('k', 'v')
    crypto.failDecrypt = true
    await expect(getAppConfig('k')).resolves.toBeNull()
  })

  it('getAppConfigJson returns null (not throws) when JSON.parse fails on decrypted value', async () => {
    // store an encrypted value whose decrypted form is NOT valid JSON
    await setAppConfig('k', 'not-json{{{')
    crypto.failDecrypt = false
    await expect(getAppConfigJson('k')).resolves.toBeNull()
  })
})

describe('write fails closed without a key', () => {
  it('setAppConfig propagates the no-key error (does NOT silently store plaintext)', async () => {
    crypto.failKey = true
    await expect(setAppConfig('k', 'v')).rejects.toThrow(/PARCHMENT_SECRET_KEY is not set/)
    expect(store.has('k')).toBe(false) // nothing persisted
  })
})
