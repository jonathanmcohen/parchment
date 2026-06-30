import { beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.4 #3: resolveOidcUser is the OIDC account-resolution core. These unit tests
// mock @/db so the (issuer,subject) identity match, the email-link anti-takeover
// gate, and the JIT-provision path are all exercised without Postgres.
//
// The headline fix under test: an IdP that sends email_verified as the STRING
// "true" (RFC-permissive; several IdPs do this) must be treated as verified so the
// email-link path fires — while a MISSING or false claim must STILL be rejected
// when it collides with an existing local account (the takeover gate is intact).

// ── A tiny fake Drizzle query builder ──────────────────────────────────────────
// resolveOidcUser issues three call shapes:
//   • db.select(...).from(...).where(...).limit(1)          → [row?] (await/then)
//   • db.insert(...).values(...)                            → await (link path)
//   • db.insert(...).values(...).onConflictDoNothing(...).returning(...) → [row?]
//   • db.update(...).set(...).where(...)                    → await (lastLogin bump)
// We queue the rows each successive SELECT should resolve to, and record inserts.

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  // FIFO queue of results for successive `.limit()` SELECTs (and the JIT re-read).
  selectResults: [] as Row[][],
  // What insert(...).values(...).returning() yields (JIT-provision insert).
  insertReturning: [] as Row[],
  inserts: [] as Row[],
  updates: [] as Row[],
}))

function makeSelectChain() {
  const chain = {
    from: () => chain,
    where: () => chain,
    // Drizzle query builders are thenable; awaiting one runs the query.
    limit: () => Promise.resolve(state.selectResults.shift() ?? []),
  }
  return chain
}

const db = vi.hoisted(() => ({
  select: () => makeSelectChain(),
  insert: () => ({
    values: (row: Row) => {
      state.inserts.push(row)
      // The link/JIT identity insert is awaited directly (no .returning()); the
      // JIT user insert chains .onConflictDoNothing().returning(). Support both by
      // returning a thenable that ALSO exposes the chain methods.
      const result = {
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve(state.insertReturning),
        }),
        then: (resolve: (v: unknown) => void) => resolve(undefined),
      }
      return result
    },
  }),
  update: () => ({
    set: (row: Row) => {
      state.updates.push(row)
      return { where: () => Promise.resolve(undefined) }
    },
  }),
}))

vi.mock('@/db', () => ({
  db,
  schema: {
    users: { id: 'users.id', email: 'users.email' },
    oidcIdentities: {
      userId: 'oi.userId',
      issuer: 'oi.issuer',
      subject: 'oi.subject',
    },
  },
}))

// env is read lazily via require() inside the JIT branch; stub it so we don't pull
// the real module graph.
vi.mock('@/lib/env', () => ({ env: { defaultQuotaMb: 0 } }))

import { resolveOidcUser } from '@/lib/auth/oidc-account'
import type { OidcClaims } from '@/lib/auth/oidc-client'

function baseClaims(overrides: Partial<OidcClaims> = {}): OidcClaims {
  return { iss: 'https://idp.example', sub: 'subject-123', ...overrides }
}

function queueSelects(...results: Row[][]) {
  state.selectResults.push(...results)
}

beforeEach(() => {
  vi.clearAllMocks()
  state.selectResults = []
  state.insertReturning = []
  state.inserts = []
  state.updates = []
})

describe('resolveOidcUser — (issuer,subject) identity match', () => {
  it('returns outcome "identity" + bumps lastLoginAt for a known, enabled identity', async () => {
    // 1st SELECT: identity row found. 2nd SELECT: the user row (enabled).
    queueSelects([{ userId: 'u-existing' }], [{ id: 'u-existing', disabledAt: null }])
    const res = await resolveOidcUser(baseClaims({ email: 'a@example.com' }))
    expect(res).toEqual({ ok: true, userId: 'u-existing', outcome: 'identity' })
    expect(state.updates.length).toBe(1) // lastLoginAt bump
  })

  it('rejects a disabled identity with reason "disabled" and never bumps lastLogin', async () => {
    queueSelects([{ userId: 'u-disabled' }], [{ id: 'u-disabled', disabledAt: new Date() }])
    const res = await resolveOidcUser(baseClaims())
    expect(res).toEqual({ ok: false, reason: 'disabled' })
    expect(state.updates.length).toBe(0)
  })
})

describe('resolveOidcUser — email-link gate (anti-takeover)', () => {
  it('links to an existing local account when email_verified is the boolean true', async () => {
    // 1st SELECT: no identity. 2nd SELECT: existing local user by email (enabled).
    queueSelects([], [{ id: 'u-local', disabledAt: null }])
    const res = await resolveOidcUser(
      baseClaims({ email: 'owner@example.com', email_verified: true }),
    )
    expect(res).toEqual({ ok: true, userId: 'u-local', outcome: 'link' })
    // The link inserts an oidc_identities row for the local user.
    expect(state.inserts.some((r) => r.userId === 'u-local')).toBe(true)
  })

  it('links when email_verified is the STRING "true" (lenient IdP)', async () => {
    queueSelects([], [{ id: 'u-local', disabledAt: null }])
    const res = await resolveOidcUser(
      // Cast: OidcClaims types email_verified as boolean, but real IdPs send "true".
      baseClaims({ email: 'owner@example.com', email_verified: 'true' as unknown as boolean }),
    )
    expect(res).toEqual({ ok: true, userId: 'u-local', outcome: 'link' })
    expect(state.inserts.some((r) => r.userId === 'u-local')).toBe(true)
  })

  it('does NOT link (denies) when email_verified is MISSING and the email collides', async () => {
    // 1st SELECT: no identity. (No verified email → skip the link SELECT.)
    // 2nd SELECT: the collision check finds an existing local user → deny.
    queueSelects([], [{ id: 'u-collision' }])
    const res = await resolveOidcUser(baseClaims({ email: 'owner@example.com' }))
    expect(res).toEqual({ ok: false, reason: 'no_verified_email_for_link' })
    // Crucially: no identity row was inserted (no silent link).
    expect(state.inserts.length).toBe(0)
  })

  it('does NOT link (denies) when email_verified is the string "false" and the email collides', async () => {
    queueSelects([], [{ id: 'u-collision' }])
    const res = await resolveOidcUser(
      baseClaims({ email: 'owner@example.com', email_verified: 'false' as unknown as boolean }),
    )
    expect(res).toEqual({ ok: false, reason: 'no_verified_email_for_link' })
    expect(state.inserts.length).toBe(0)
  })

  it('denies a disabled local account on a verified-email link attempt (no identity insert)', async () => {
    queueSelects([], [{ id: 'u-disabled', disabledAt: new Date() }])
    const res = await resolveOidcUser(
      baseClaims({ email: 'owner@example.com', email_verified: true }),
    )
    expect(res).toEqual({ ok: false, reason: 'disabled' })
    expect(state.inserts.length).toBe(0)
  })
})

describe('resolveOidcUser — JIT provision', () => {
  it('creates a brand-new editor user when no identity and no email collision exist', async () => {
    // 1st SELECT: no identity. email_verified true but no existing local user →
    // 2nd SELECT (link lookup): empty. Then the JIT insert returns the new id.
    queueSelects([], [])
    state.insertReturning = [{ id: 'u-new' }]
    const res = await resolveOidcUser(
      baseClaims({ email: 'fresh@example.com', email_verified: true, name: 'Fresh User' }),
    )
    expect(res).toEqual({ ok: true, userId: 'u-new', outcome: 'jit' })
    // The new user row was inserted with role editor + the provision email.
    const userInsert = state.inserts.find((r) => r.email === 'fresh@example.com')
    expect(userInsert).toBeDefined()
    expect(userInsert?.role).toBe('editor')
    expect(userInsert?.passwordHash).toBeNull()
    // And an identity row links it.
    expect(state.inserts.some((r) => r.userId === 'u-new')).toBe(true)
  })
})
