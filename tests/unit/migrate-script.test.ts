import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// v0.2.15 regression guard for rootfs/etc/parchment/migrate.sh.
//
// Every release up to v0.2.14 shipped a migrate.sh that READ the `migrations`
// table and INSERTed into it, but nothing ever CREATED it. Found on production
// 2026-08-04: a five-week-old database logged "fresh database; running all
// migrations" and `SELECT to_regclass('public.migrations')` returned NULL after
// a full run. Every boot replayed all 28 migrations.
//
// These are text-level assertions on the shell script, which is shallow — but it
// is the only coverage that actually EXECUTES. tests/integration is excluded from
// the CI vitest run (`--exclude '**/integration/**'`), so the real behavioural
// test next door in tests/integration/migrate-script.test.ts never gates a
// release. Until that changes, these guards are what stops the regression.

const script = readFileSync(path.resolve('rootfs/etc/parchment/migrate.sh'), 'utf8')

// Strip comments so prose about a construct cannot satisfy an assertion about it.
const code = script
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('#'))
  .join('\n')

describe('migrate.sh bookkeeping', () => {
  it('creates the migrations table', () => {
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS migrations/)
  })

  it('gives the table a primary key on name, so recording is idempotent', () => {
    const create = code.slice(code.indexOf('CREATE TABLE IF NOT EXISTS migrations'))
    expect(create.slice(0, 200)).toMatch(/name\s+text PRIMARY KEY/)
  })

  it('probes for the table BEFORE creating it', () => {
    // The probe is what distinguishes a pre-bookkeeping database from a tracked
    // one. Creating first would make every database look "already tracked" and
    // the tolerant reconciliation pass would never run.
    const probe = code.indexOf("to_regclass('public.migrations')")
    const create = code.indexOf('CREATE TABLE IF NOT EXISTS migrations')
    expect(probe).toBeGreaterThan(-1)
    expect(create).toBeGreaterThan(-1)
    expect(probe).toBeLessThan(create)
  })

  it('records each applied migration with ON CONFLICT DO NOTHING', () => {
    expect(code).toMatch(/INSERT INTO migrations[\s\S]{0,160}ON CONFLICT \(name\) DO NOTHING/)
  })

  it('does not silence the bookkeeping INSERT', () => {
    // The original bug's camouflage: `2>/dev/null || true` on the INSERT meant
    // the failure to record was invisible for months.
    const insert = code.slice(code.indexOf('INSERT INTO migrations'))
    const stmt = insert.slice(0, insert.indexOf('done'))
    expect(stmt).not.toMatch(/2>\/dev\/null/)
    expect(stmt).not.toMatch(/\|\|\s*true/)
  })
})

describe('migrate.sh failure modes', () => {
  it('applies migrations strictly once bookkeeping is trustworthy', () => {
    // Without ON_ERROR_STOP, `psql -f` exits 0 even when every statement fails,
    // so `set -e` never trips and a migration that did nothing still gets
    // recorded as applied.
    expect(code).toMatch(/ON_ERROR_STOP=1 -f "\$SQL_FILE"/)
  })

  it('keeps the bootstrap pass tolerant', () => {
    // A pre-bookkeeping database already carries the schema, so "already exists"
    // is the expected outcome of the reconciliation pass. Running that pass
    // strictly would abort the boot on upgrade — turning this fix into an outage.
    expect(code).toMatch(/BOOTSTRAP" = "1"[\s\S]{0,120}-f "\$SQL_FILE" \|\| true/)
  })

  it('sets -e so a strict failure actually halts the boot', () => {
    expect(script).toMatch(/^set -e$/m)
  })

  it('skips a migration that is already recorded', () => {
    expect(code).toMatch(/ALREADY_RAN[\s\S]{0,200}continue/)
  })
})

describe('migrate.sh connection handling', () => {
  it('never hardcodes the database name or user in a query', () => {
    // Both are parsed from DATABASE_URL; hardcoding 'parchment' has bitten this
    // script before and is why the existing comments shout about it.
    const queries = code.match(/psql_q[^\n]*/g) ?? []
    expect(queries.length).toBeGreaterThan(0)
    for (const q of queries) {
      expect(q).not.toMatch(/-d parchment\b/)
      expect(q).not.toMatch(/-U parchment\b/)
    }
  })

  it('routes every psql call through the shared helper', () => {
    // psql_q centralises host/port/user/db. A direct `psql -h` call would be a
    // path where one of them could drift.
    const direct = code.match(/^\s*psql -h/gm) ?? []
    expect(direct).toHaveLength(0)
  })
})
