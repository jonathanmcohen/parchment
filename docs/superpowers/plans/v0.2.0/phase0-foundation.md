# Phase 0 — Shared Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four shared primitives that every other v0.2.0 group depends on — before any of B, G, backup-sync, or H touches the codebase. Phase 0 produces: (1) the AES-256-GCM secret helper `src/lib/crypto/secret-box.ts`; (2) the `app_config` table in migration **0020** plus the canonical encrypted config repo `src/lib/config/repo.ts` that is the sole accessor of that table; (3) a hardened `audit_log` with the merged `AuditAction` union, `verifyAuditChain`, and an append-only trigger in migration **0021**. Nothing in this plan is provisional — all four outputs are consumed by name and type by downstream groups, so correctness failures here cascade everywhere.

**Source of truth:** `docs/superpowers/plans/v0.2.0/00-RECONCILIATION.md` §1a (secret-box), §1b (app_config), §1d (audit), §2 (migration block). Where this plan disagrees with the RECONCILIATION, the RECONCILIATION wins.

**Tech stack (unchanged from existing codebase):** Next.js 16, TypeScript 6 strict, Drizzle ORM + node-postgres (Postgres 18 / pgvector), Vitest (unit + Testcontainers integration). No new runtime dependencies are required by this plan — `node:crypto` covers AES-256-GCM.

---

## Global constraints

- **Release branch:** all work lands on `release/v0.2.0` in a single PR per the build-discipline feedback; do NOT commit to `main` directly.
- **TDD discipline:** for every task, write the failing test first, confirm it fails, implement, confirm it passes, then commit. Never implement before the test exists.
- **No drizzle-kit for 0020/0021.** These migrations are hand-written to match the style of `src/db/migrations/0019_breezy_reptil.sql`. Add each to `src/db/migrations/meta/_journal.json` (idx 20 / 21, version `"7"`, `when` = current epoch-ms, matching tag, `breakpoints: true`). Do NOT run `drizzle-kit generate`.
- **No new crypto modules.** The ONLY AES-256-GCM helper is `src/lib/crypto/secret-box.ts`. Any existing `src/lib/config/encrypt.ts` or `src/lib/config/crypto.ts` files found on the branch must be deleted; any `APP_SECRET` references must be removed in favour of `PARCHMENT_SECRET_KEY`.
- **`env.ts` convention:** follow the pattern in `src/lib/env.ts` — properties on the `env` object, `required()` helper for validated vars, block-comment explaining each addition. The secret-key validation is a hard `throw` at import time if the key is present but malformed (not 32 decoded bytes); if absent entirely, the module still loads (secret WRITES 503 at the route level, reads of unencrypted config still work).
- **`audit/index.ts` convention:** the existing file is `src/lib/audit/index.ts`; this plan replaces its body in-place (no new file). The `logAudit` function MUST NEVER throw to the caller (existing comment; keep it).
- **Secrets never appear in plaintext in logs.** Any error path that might touch the key or a decrypted value must redact via `redactSecret`. Tests must assert this.
- **Latest stable deps:** pin newest stable for any new dependency; prefer `node:crypto` (no dep) over third-party AES libs.

---

## File structure

New files (created by this plan):

- `src/lib/crypto/secret-box.ts` — AES-256-GCM envelope encrypt/decrypt + mask helpers.
- `src/lib/config/repo.ts` — encrypted config repo over `app_config`; the only module that reads/writes `app_config`.
- `src/db/migrations/0020_app_config.sql` — `app_config` table.
- `src/db/migrations/0021_audit_hardening.sql` — `audit_log` columns + append-only trigger.
- `tests/unit/secret-box.test.ts` — pure unit tests (no DB, no env).
- `tests/unit/config-repo.test.ts` — unit tests for config/repo.ts (mocked DB + crypto).
- `tests/integration/secret-box-env.test.ts` — env validation tests (wrong-key, absent-key).
- `tests/integration/audit-phase0.test.ts` — hash-chain + append-only trigger + verifyAuditChain tests (Testcontainers).

Modified files:

- `src/lib/env.ts` — add `secretKey` (validated) and `secretKeyConfigured` (boolean) to the `env` object.
- `src/lib/audit/index.ts` — expand `AuditAction` union, add `ip` + hash-chain params to `logAudit`, update schema insert.
- `src/db/schema.ts` — add `appConfig` table and new `auditLog` columns (`ip`, `prevHash`, `entryHash`; `targetId` type change to `text`).
- `src/db/migrations/meta/_journal.json` — append entries for idx 20 and 21.

---

## Interfaces downstream groups import (freeze before Task 3)

```ts
// src/lib/crypto/secret-box.ts
export const SECRET_MASK = '••••••••'
export function isMasked(v: string): boolean
export function redactSecret(v: string): string          // returns SECRET_MASK if not masked
export function encryptSecret(plain: string): string     // returns 'v1:<b64iv>:<b64ct>:<b64tag>'
export function decryptSecret(envelope: string): string  // throws DecryptError on wrong key / tamper

// src/lib/config/repo.ts — ENCRYPTED config repo over the app_config table (Task 4b)
// B, backup-sync, and G ALL import from here. No other module touches app_config directly.
export async function setAppConfig(key: string, plaintext: string): Promise<void>
export async function getAppConfig(key: string): Promise<string | null>
export async function deleteAppConfig(key: string): Promise<void>
export async function setAppConfigJson(key: string, obj: unknown): Promise<void>
export async function getAppConfigJson<T>(key: string): Promise<T | null>

// src/lib/audit/index.ts
export type AuditAction =
  // Pre-existing verbs (A4 / I5)
  | 'create' | 'delete' | 'share' | 'export' | 'login'
  // A's user lifecycle verbs — ALL DOTTED per §1d canonical list
  | 'user.create' | 'user.invite' | 'user.disable' | 'user.enable' | 'user.delete'
  | 'user.role' | 'ownership.transfer'
  // A's document permission verbs — ALL DOTTED per §1d canonical list
  | 'doc.share' | 'doc.unshare'
  // G's security verbs — ALL DOTTED per §1d canonical list
  | 'session.revoke' | 'mfa.enable' | 'mfa.disable' | 'oidc.config' | 'login.locked'

export interface AuditOptions {
  actorId?: string
  targetType?: string
  targetId?: string    // text (not uuid — post-0021)
  meta?: Record<string, unknown>
  ip?: string          // G's addition; stored in audit_log.ip
}
export async function logAudit(action: AuditAction, opts?: AuditOptions): Promise<void>

// Integrity check: re-hashes the prev_hash→entry_hash chain and returns the first broken row.
// G's admin "Verify integrity" affordance and its tests consume this.
export async function verifyAuditChain(): Promise<{ ok: boolean; brokenAt?: string }>
```

---

## Tasks

---

### Task 1 — Unit tests for `secret-box.ts` (write FIRST, all must fail)

**File:** `tests/unit/secret-box.test.ts`

Write a complete Vitest unit test file. Do NOT create `src/lib/crypto/secret-box.ts` yet — all tests must fail with "Cannot find module" or similar.

- [ ] **1a** Create `tests/unit/secret-box.test.ts` with these test cases:

```
describe('SECRET_MASK / isMasked / redactSecret')
  it('SECRET_MASK is the literal ••••••••')
  it('isMasked returns true for SECRET_MASK')
  it('isMasked returns false for plaintext')
  it('redactSecret returns SECRET_MASK for any non-masked string')
  it('redactSecret returns SECRET_MASK unchanged for already-masked string')

describe('encryptSecret / decryptSecret — happy path')
  it('round-trips a short string')
  it('round-trips an empty string')
  it('round-trips a 4096-char string')
  it('envelope matches v1:<b64>:<b64>:<b64> format (regex)')
  it('two encryptions of the same plaintext produce different envelopes (random IV)')

describe('decryptSecret — failure paths')
  it('throws on a wrong base64-32B key')
  it('throws on a truncated envelope (missing tag segment)')
  it('throws on a tampered ciphertext (bit-flip)')
  it('throws on an unknown envelope version prefix')
  it('error message does NOT contain the plaintext or the key')
```

Use `PARCHMENT_SECRET_KEY` set to a fresh `Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')` in a `beforeAll`. The wrong-key test uses a DIFFERENT 32-byte base64 key.

- [ ] **1b** Run `pnpm vitest run tests/unit/secret-box.test.ts` and confirm every test fails (not erroring at the runner level — the import failure is the expected failure mode here). Record the failure count in a comment at the top of the file.

---

### Task 2 — Implement `src/lib/crypto/secret-box.ts`

**File:** `src/lib/crypto/secret-box.ts`

Implement only what the unit tests require. No other crypto functionality.

- [ ] **2a** Create `src/lib/crypto/secret-box.ts`:

```ts
// AES-256-GCM secret envelope helper — Phase 0 canonical crypto module.
// ALL other modules that need to encrypt/decrypt instance secrets import from here.
// NO other crypto module for this purpose is created anywhere in the codebase.
//
// Envelope format: 'v1:<base64 12-byte IV>:<base64 ciphertext>:<base64 16-byte GCM tag>'
// Master key:      PARCHMENT_SECRET_KEY (base64-encoded 32 bytes), validated in env.ts.
//
// Key loading: resolves `process.env.PARCHMENT_SECRET_KEY` at call time (not module
// load time) so the module can be imported even when the key is absent (secret WRITES
// return 503 at the route level; reads of unencrypted config still work).
```

  - Export `SECRET_MASK = '••••••••'` (the exact 8 bullet characters U+2022).
  - Export `isMasked(v: string): boolean` — returns `v === SECRET_MASK`.
  - Export `redactSecret(v: string): string` — returns `SECRET_MASK` (always; the caller decides when to redact).
  - Export `encryptSecret(plain: string): string`:
    - Reads `PARCHMENT_SECRET_KEY` from env, base64-decodes to a 32-byte `Buffer`; throws `Error('PARCHMENT_SECRET_KEY is not set')` if absent.
    - Generates a 12-byte random IV via `node:crypto` `randomBytes`.
    - Uses `createCipheriv('aes-256-gcm', keyBuf, iv)`.
    - Returns `v1:${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`.
  - Export `decryptSecret(envelope: string): string`:
    - Splits on `:` — exactly 4 parts (`v1`, iv, ct, tag); throws `DecryptError` on any mismatch.
    - Checks version prefix is `v1`; throws `DecryptError('unsupported envelope version')` otherwise.
    - Reads key from env; throws `DecryptError('PARCHMENT_SECRET_KEY is not set')` if absent.
    - Uses `createDecipheriv('aes-256-gcm', ...)` with `setAuthTag`; catches `ERR_CRYPTO_INVALID_AUTH_TAG` and rethrows as `DecryptError('decryption failed')`.
    - Error messages MUST NOT interpolate the plaintext, the ciphertext, or the key.
  - Export `class DecryptError extends Error {}` (for typed catch by callers).
  - All imports are from `node:crypto` only.

- [ ] **2b** Run `pnpm vitest run tests/unit/secret-box.test.ts` — all tests must pass. Fix until green before proceeding.

- [ ] **2c** Run `pnpm tsc --noEmit` — no new type errors.

---

### Task 3 — Env validation for `PARCHMENT_SECRET_KEY`

**Files:** `src/lib/env.ts`, `tests/integration/secret-box-env.test.ts`

Write the env-validation tests first.

- [ ] **3a** Create `tests/integration/secret-box-env.test.ts`:

```
describe('env.ts — PARCHMENT_SECRET_KEY validation')
  it('accepts a valid base64-32B key and sets secretKeyConfigured = true')
  it('throws at import-time when key is present but decodes to fewer than 32 bytes')
  it('throws at import-time when key is present but decodes to more than 32 bytes')
  it('throws at import-time when key is present but is not valid base64')
  it('sets secretKeyConfigured = false and does NOT throw when key is absent')
  it('encryptSecret throws a clear error (not a crypto crash) when called without key set')
```

Each test must `vi.unstubAllEnvs()` / `vi.stubEnv` (or `delete process.env.PARCHMENT_SECRET_KEY`) and use a dynamic `import()` with `vi.resetModules()` to re-evaluate `env.ts` with the new env. Pattern: use `await vi.importActual` after `vi.resetModules`.

- [ ] **3b** Run `pnpm vitest run tests/integration/secret-box-env.test.ts` — all tests must fail.

- [ ] **3c** Edit `src/lib/env.ts` — add to the `env` object (follow existing comment style):

```ts
// PARCHMENT_SECRET_KEY (required for encrypted config writes). base64-encoded 32 bytes.
// If absent, secret WRITES return 503; reads of unencrypted config still work.
// If present but malformed (not exactly 32 decoded bytes), the process fails at boot.
secretKey: (() => {
  const raw = process.env.PARCHMENT_SECRET_KEY
  if (!raw) return null
  let buf: Buffer
  try { buf = Buffer.from(raw, 'base64') } catch {
    throw new Error('PARCHMENT_SECRET_KEY is not valid base64')
  }
  if (buf.length !== 32)
    throw new Error(`PARCHMENT_SECRET_KEY must decode to exactly 32 bytes, got ${buf.length}`)
  return raw   // keep as base64 string; secret-box re-decodes at call time
})(),
secretKeyConfigured: !!process.env.PARCHMENT_SECRET_KEY,
```

- [ ] **3d** Run `pnpm vitest run tests/integration/secret-box-env.test.ts` — all tests must pass.

- [ ] **3e** Run `pnpm tsc --noEmit` — no new type errors.

- [ ] **3f** Commit: `feat(phase0): secret-box AES-256-GCM + env validation`

---

### Task 4 — Migration 0020: `app_config` table

**Files:** `src/db/migrations/0020_app_config.sql`, `src/db/migrations/meta/_journal.json`, `src/db/schema.ts`

- [ ] **4a** Create `src/db/migrations/0020_app_config.sql`:

```sql
CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

Match the Drizzle-style formatting exactly (tabs, quoted identifiers) as seen in `0019_breezy_reptil.sql`.

- [ ] **4b** Append to `src/db/migrations/meta/_journal.json` (inside the `entries` array, after the idx 19 entry):

```json
{
  "idx": 20,
  "version": "7",
  "when": <current epoch ms>,
  "tag": "0020_app_config",
  "breakpoints": true
}
```

Use the actual epoch-ms at authoring time (e.g., `Date.now()`).

- [ ] **4c** Add to `src/db/schema.ts` (near the end of the table definitions, with a comment):

```ts
// ─── app_config (Phase 0, 1b) — instance-level encrypted config ──────────────
// All instance secrets (SMTP, S3, git-sync, OIDC client secret, etc.) live here
// encrypted via src/lib/crypto/secret-box.ts. NOT drizzle-kit managed for 0020.
export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **4d** Verify the migration applies cleanly against the Testcontainers DB used by `tests/integration/audit-phase0.test.ts` (Task 5 sets this up). If running the migration file manually against a test DB is needed, do it now.

- [ ] **4e** Run `pnpm tsc --noEmit` — no new type errors.

---

### Task 4b — Build `src/lib/config/repo.ts` (TDD)

**Files:** `src/lib/config/repo.ts`, `tests/unit/config-repo.test.ts`

This is the **canonical ENCRYPTED config repo** over the `app_config` table. It is the ONLY module that reads or writes `app_config`. B, backup-sync, and G ALL import from `@/lib/config/repo`. **No other module may access `app_config` directly.** B MUST NOT create `src/lib/config/app-config-repo.ts`; it uses this file.

**Write the failing tests first.**

- [ ] **4b-1** Create `tests/unit/config-repo.test.ts`:

  Use `vi.mock('@/db', ...)` and `vi.mock('@/lib/crypto/secret-box', ...)` so tests are pure-unit (no Testcontainers, no real crypto). Provide a minimal in-memory `appConfig` map as the mock DB backend.

  ```
  describe('setAppConfig / getAppConfig — round-trip')
    it('stores the encrypted value and retrieves the decrypted plaintext')
    it('overwriting a key returns the latest value')
    it('getAppConfig returns null for a missing key')

  describe('setAppConfigJson / getAppConfigJson — round-trip')
    it('serialises an object to JSON, encrypts, stores, retrieves, deserialises')
    it('getAppConfigJson returns null for a missing key')
    it('getAppConfigJson returns null when decryptSecret throws (corrupt envelope)')

  describe('deleteAppConfig')
    it('removes the key so subsequent getAppConfig returns null')

  describe('decryption failure isolation')
    it('getAppConfig returns null (not throws) when decryptSecret throws DecryptError')
    it('getAppConfigJson returns null (not throws) when JSON.parse fails on decrypted value')
  ```

- [ ] **4b-2** Run `pnpm vitest run tests/unit/config-repo.test.ts` — all tests must fail ("Cannot find module" or similar). Record the count in a comment at the top of the file.

- [ ] **4b-3** Create `src/lib/config/repo.ts`:

  ```ts
  // Canonical ENCRYPTED config repo — Phase 0 §1b.
  // The ONLY module that reads/writes the app_config table.
  // B, backup-sync, and G import from here. No other module accesses app_config directly.
  //
  // Each value is encrypted at rest via src/lib/crypto/secret-box.ts.
  // If PARCHMENT_SECRET_KEY is absent, setAppConfig/setAppConfigJson throw (503 path).
  // getAppConfig/getAppConfigJson return null on decrypt failure (corrupt envelope → treat as missing).
  import { eq } from 'drizzle-orm'
  import { db, schema } from '@/db'
  import { decryptSecret, encryptSecret, DecryptError } from '@/lib/crypto/secret-box'
  ```

  Implement:

  - `setAppConfig(key: string, plaintext: string): Promise<void>` — encrypts with `encryptSecret`, upserts into `app_config` (`INSERT ... ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`).
  - `getAppConfig(key: string): Promise<string | null>` — reads from `app_config`, decrypts with `decryptSecret`; returns `null` if row missing **or** if `decryptSecret` throws `DecryptError` (log the error, do not rethrow). Any other error rethrows.
  - `deleteAppConfig(key: string): Promise<void>` — deletes the row by key.
  - `setAppConfigJson(key: string, obj: unknown): Promise<void>` — `JSON.stringify(obj)` then `setAppConfig`.
  - `getAppConfigJson<T>(key: string): Promise<T | null>` — `getAppConfig` then `JSON.parse`; catches `SyntaxError` and returns `null` (log the parse error).

- [ ] **4b-4** Run `pnpm vitest run tests/unit/config-repo.test.ts` — all tests must pass. Fix until green.

- [ ] **4b-5** Run `pnpm tsc --noEmit` — no new type errors.

- [ ] **4b-6** Run `pnpm biome check .` — no new lint violations.

- [ ] **4b-7** Commit: `feat(phase0): config/repo.ts — encrypted app_config CRUD`

---

### Task 5 — Integration tests for audit hardening (write FIRST, all must fail)

**File:** `tests/integration/audit-phase0.test.ts`

Write the complete integration test file before modifying `audit/index.ts` or creating migration 0021. Use the Testcontainers pattern from `tests/integration/audit.test.ts`.

- [ ] **5a** Create `tests/integration/audit-phase0.test.ts`:

The `beforeAll` must:
1. Start `pgvector/pgvector:pg18` container.
2. Apply ALL `.sql` files in `src/db/migrations/` in sort order (same pattern as existing `audit.test.ts`).
3. Set `process.env.DATABASE_URL`.

Test cases:

```
describe('Phase 0 — audit_log schema (migration 0021)')
  it('audit_log has ip column (text, nullable)')
  it('audit_log has prev_hash column (text, nullable)')
  it('audit_log has entry_hash column (text, nullable)')
  it('audit_log.target_id is text, not uuid — accepts a non-uuid string')

describe('Phase 0 — append-only trigger')
  it('UPDATE on audit_log raises an exception (trigger blocks it)')
  it('DELETE on audit_log raises an exception (trigger blocks it)')
  it('INSERT on audit_log succeeds (trigger allows it)')

describe('Phase 0 — logAudit hash chain')
  it('first row has prev_hash = NULL and entry_hash set to a 64-hex sha256')
  it('second row prev_hash equals first row entry_hash')
  it('third row prev_hash equals second row entry_hash — chain is intact')
  it('logAudit with ip stores the ip in audit_log.ip')
  it('logAudit with merged AuditAction verb "user.create" writes successfully')
  it('logAudit with merged AuditAction verb "oidc.config" writes successfully')
  it('logAudit with merged AuditAction verb "mfa.enable" writes successfully')
  it('logAudit never throws to the caller even when DB is down')
```

For the trigger tests: use a raw `pg.Client` query (`UPDATE audit_log SET action = 'x' WHERE ...`) and assert the promise rejects with a Postgres error containing `'append-only'` (or equivalent wording from the trigger).

For the hash-chain tests: insert 3 rows via `logAudit(...)`, then read back from the raw client in insertion order and assert the `prev_hash`/`entry_hash` linkage.

- [ ] **5b** Run `pnpm vitest run tests/integration/audit-phase0.test.ts` — all tests must fail (migration 0021 does not exist yet, trigger does not exist yet).

---

### Task 6 — Migration 0021: `audit_log` hardening

**Files:** `src/db/migrations/0021_audit_hardening.sql`, `src/db/migrations/meta/_journal.json`

- [ ] **6a** Create `src/db/migrations/0021_audit_hardening.sql`:

```sql
-- Phase 0 §1d: harden audit_log for G's ip, hash-chain integrity, and append-only enforcement.
-- target_id is changed from uuid to text so non-uuid identifiers (OIDC subject, session hash,
-- config key) can be stored without casting.

-- 1. Add columns
ALTER TABLE "audit_log"
  ADD COLUMN "ip"         text,
  ADD COLUMN "prev_hash"  text,
  ADD COLUMN "entry_hash" text;

-- 2. Change target_id from uuid to text (existing rows: null cast is identity)
--> statement-breakpoint
ALTER TABLE "audit_log"
  ALTER COLUMN "target_id" TYPE text USING "target_id"::text;

-- 3. Append-only trigger: BEFORE UPDATE or DELETE, raise an exception.
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: UPDATE and DELETE are not permitted';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_mutation
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
```

- [ ] **6b** Append to `src/db/migrations/meta/_journal.json` (after idx 20):

```json
{
  "idx": 21,
  "version": "7",
  "when": <current epoch ms>,
  "tag": "0021_audit_hardening",
  "breakpoints": true
}
```

- [ ] **6c** Update `src/db/schema.ts` — `auditLog` table definition:
  - Change `targetId: uuid('target_id')` → `targetId: text('target_id')` (removes the `.references(...)` FK if any — `target_id` is intentionally untyped for cross-entity use).
  - Add three columns:
    ```ts
    ip:        text('ip'),
    prevHash:  text('prev_hash'),
    entryHash: text('entry_hash'),
    ```
  - Update the comment on `action` to reflect the merged union.

- [ ] **6d** Run the integration test suite (it replays all migrations including 0021): `pnpm vitest run tests/integration/audit-phase0.test.ts` — the schema/trigger/column tests must now pass; the hash-chain tests still fail (logAudit not yet updated).

---

### Task 7 — Update `src/lib/audit/index.ts`

**File:** `src/lib/audit/index.ts`

Implement the merged `AuditAction` union and hash-chain `logAudit`. Do NOT change the public function signature in a way that breaks existing call-sites — `opts` stays optional with all fields optional.

- [ ] **7a** Rewrite `src/lib/audit/index.ts` in full:

```ts
import { createHash } from 'node:crypto'
import { db, schema } from '@/db'

// ─── Merged AuditAction union (Phase 0 §1d) ─────────────────────────────────
// A's verbs + G's verbs in one closed set. Extend by ADDING to this union,
// never by replacing it. All call-sites must stay type-safe after extension.
//
// CANONICAL DOTTED VERB LIST (§1d). BANNED variants:
//   user.role_change, doc.permission_grant, doc.permission_revoke,
//   doc.permission_change, oidc_config, login_locked, session_revoke,
//   mfa_enable, mfa_disable — NEVER use these underscored / _change / _grant forms.
export type AuditAction =
  // Pre-existing verbs (A4 / I5)
  | 'create'
  | 'delete'
  | 'share'
  | 'export'
  | 'login'
  // A's user lifecycle verbs — ALL DOTTED per §1d canonical list
  | 'user.create'
  | 'user.invite'
  | 'user.disable'
  | 'user.enable'
  | 'user.delete'
  | 'user.role'
  | 'ownership.transfer'
  // A's document permission verbs — ALL DOTTED per §1d canonical list
  | 'doc.share'
  | 'doc.unshare'
  // G's security verbs — ALL DOTTED per §1d canonical list
  | 'session.revoke'
  | 'mfa.enable'
  | 'mfa.disable'
  | 'oidc.config'
  | 'login.locked'

export interface AuditOptions {
  actorId?: string
  targetType?: string
  /** text, not uuid — any identifier string is valid post-migration 0021 */
  targetId?: string
  meta?: Record<string, unknown>
  /** Caller's best-effort client IP. Stored in audit_log.ip. */
  ip?: string
}

/**
 * Write a single audit row with a sha256 hash chain.
 *
 * prev_hash: sha256 of the previous row's entry_hash (or null for the first row).
 * entry_hash: sha256 of `${action}|${actorId}|${targetId}|${prev_hash}|${Date.now()}`.
 *
 * This MUST NEVER throw to the caller — auditing is a side-effect of the real
 * action and must not be able to block or fail it.
 */
export async function logAudit(action: AuditAction, opts: AuditOptions = {}): Promise<void> {
  try {
    // Fetch the most recent entry_hash to build the chain.
    // A raw SQL query is used to avoid coupling the chain to the ORM select surface.
    const { rows } = await (db as unknown as { execute(sql: unknown): Promise<{ rows: Array<{ entry_hash: string | null }> }> })
      .execute(
        // Use Drizzle's sql tag if available, else fall back to pg raw.
        // The import here uses the same pattern as the existing db usage.
      )
    // ... (implementer note below — see full body)
  } catch (err) {
    console.error('audit write failed', { action, opts, err })
  }
}
```

**Full implementation guidance for the implementer:**

The `logAudit` body must:
1. Query `SELECT entry_hash FROM audit_log ORDER BY created_at DESC LIMIT 1` via the `db` connection (use `db.execute(sql\`...\`)` from Drizzle, matching the pattern in other repo files). Wrap in a try/catch — if this read fails, use `null` as `prevHash` (do not abort the write).
2. Compute `prevHash = rows[0]?.entry_hash ?? null`.
3. Compute `entryHash = createHash('sha256').update([action, opts.actorId ?? '', opts.targetId ?? '', prevHash ?? '', Date.now().toString()].join('|')).digest('hex')`.
4. Insert with `db.insert(schema.auditLog).values({ action, actorId: opts.actorId ?? null, targetType: opts.targetType ?? null, targetId: opts.targetId ?? null, meta: opts.meta ?? null, ip: opts.ip ?? null, prevHash, entryHash })`.
5. Entire function body wrapped in `try { ... } catch (err) { console.error('audit write failed', { action, opts, err }) }`. The error log MUST NOT include any value that could be a secret (opts.meta could contain sensitive fields — log only `action` and the top-level keys of opts, not its values, or pass `{ action, optKeys: Object.keys(opts) }`).

Also export `verifyAuditChain` from the same file:

```ts
/**
 * Re-hash the prev_hash→entry_hash chain for every row in audit_log (ordered by
 * created_at ASC) and return the first row where the stored entry_hash does not
 * match the expected hash. Returns { ok: true } if the chain is intact.
 *
 * The expected entry_hash for each row is recomputed as:
 *   sha256(`${action}|${actorId ?? ''}|${targetId ?? ''}|${prevHash ?? ''}|${createdAtMs}`)
 * where createdAtMs = new Date(row.created_at).getTime().toString()
 *
 * Returns { ok: false, brokenAt: <entry_hash of the first broken row> } on
 * the first mismatch (stops at the first break — does not scan the entire chain
 * past a break, since subsequent hashes will also be wrong).
 */
export async function verifyAuditChain(): Promise<{ ok: boolean; brokenAt?: string }>
```

**TDD: add one new test to `tests/integration/audit-phase0.test.ts` before implementing `verifyAuditChain`:**

- [ ] **7-chain-1** Add to the test file (write before implementing):

  ```
  describe('Phase 0 — verifyAuditChain')
    it('returns { ok: true } when the chain is intact after 3 rows')
    it('returns { ok: false, brokenAt: <hash> } when a stored entry_hash is tampered')
  ```

  The tamper test must bypass the append-only trigger to directly update a row's `entry_hash` (use `SET session_replication_role = replica` to suppress triggers, or drop+recreate the trigger temporarily within the test transaction, or use a superuser connection — document which approach is used). Assert that `verifyAuditChain()` returns `{ ok: false, brokenAt: <the tampered row's stored entry_hash> }`.

- [ ] **7-chain-2** Run the new describe block — it must fail (function not yet exported).

- [ ] **7-chain-3** Implement `verifyAuditChain` in `src/lib/audit/index.ts`. Export it.

- [ ] **7-chain-4** Run `pnpm vitest run tests/integration/audit-phase0.test.ts` — all tests (including new chain tests) must pass.

- [ ] **7b** Run `pnpm vitest run tests/integration/audit-phase0.test.ts` — all tests must pass. Fix until green.

- [ ] **7c** Run the existing audit integration test to ensure no regression: `pnpm vitest run tests/integration/audit.test.ts`. All must pass.

- [ ] **7d** Run `pnpm tsc --noEmit` — no type errors. Pay particular attention to `AuditAction` call-sites in the existing codebase (`'create' | 'delete' | 'share' | 'export' | 'login'` must still compile as the union is a superset).

- [ ] **7e** Run `pnpm biome check .` — no lint errors introduced.

- [ ] **7f** Commit: `feat(phase0): migration 0020 app_config + migration 0021 audit hardening + merged logAudit`

---

### Task 8 — Audit existing call-sites for `AuditAction` compatibility

- [ ] **8a** Run:
  ```
  grep -r "logAudit\|AuditAction" src/ --include="*.ts" --include="*.tsx" -l
  ```
  For each file found, confirm it imports from `@/lib/audit` (or `@/lib/audit/index`) and that every call passes a verb now present in the merged `AuditAction` union. If any call passes a string literal that is not in the union, add it to the union in `src/lib/audit/index.ts` and re-run tsc.

- [ ] **8b** Run `pnpm tsc --noEmit` one final time — zero errors.

---

### Task 9 — Full test suite smoke-run

- [ ] **9a** Run the full unit test suite: `pnpm vitest run tests/unit/`. All tests must pass (including the pre-existing ones — no regressions).

- [ ] **9b** Run the full integration test suite: `pnpm vitest run tests/integration/`. All tests must pass.

- [ ] **9c** Run `pnpm build` — production build succeeds with no type or bundler errors.

- [ ] **9d** Commit any final fixups: `fix(phase0): post-sweep corrections`

---

### Task 10 — Security review

- [ ] **10a** Invoke `superpowers:requesting-code-review` with scope = `security` targeting the diff of this branch against `release/v0.2.0`'s base. Provide the reviewer with these specific questions:

  1. **Secret-box:** Can the plaintext or key ever appear in a log line, error message, or HTTP response body? Check all error paths in `encryptSecret` / `decryptSecret` and the `logAudit` error log.
  2. **Secret-box:** Is the IV truly random per call (not reused, not derived from the key or plaintext)?
  3. **Secret-box:** Does `decryptSecret` fail closed on a tampered tag — i.e., does it raise `DecryptError` before returning any partial plaintext?
  4. **Secret-box:** Does missing `PARCHMENT_SECRET_KEY` cause encrypt calls to throw clearly (not silently encrypt with a zero key or similar)?
  5. **env.ts:** Does a malformed key (e.g., 16-byte base64) throw at boot or silently pass through?
  6. **audit trigger:** Does the Postgres `BEFORE UPDATE OR DELETE` trigger fire for all mutation paths, including `ON CONFLICT DO UPDATE`? (If so, is that intended? Probably yes — `app_config` upserts go to `app_config`, not `audit_log`.)
  7. **Hash chain:** Is the hash chain tamper-evident in a meaningful sense — i.e., if an attacker deletes a row or alters a stored hash, is the break detectable on read? Note any limitations (the chain is only as strong as the append-only trigger; document the trust model).
  8. **logAudit error log:** Does the error catch block leak any secret material from `opts.meta`?

- [ ] **10b** Address every finding rated P1/P2 (security-critical / high) before marking Phase 0 complete. Log each finding and its resolution as a comment in the relevant source file.

- [ ] **10c** Final commit: `chore(phase0): security review findings addressed`

---

## Acceptance criteria (phase complete when ALL pass)

- [ ] `pnpm vitest run tests/unit/secret-box.test.ts` — 15 tests green.
- [ ] `pnpm vitest run tests/integration/secret-box-env.test.ts` — 6 tests green.
- [ ] `pnpm vitest run tests/unit/config-repo.test.ts` — 10 tests green.
- [ ] `pnpm vitest run tests/integration/audit-phase0.test.ts` — 16 tests green (14 original + 2 verifyAuditChain).
- [ ] `pnpm vitest run tests/integration/audit.test.ts` — existing 3 tests still green (no regression).
- [ ] `pnpm tsc --noEmit` — zero errors.
- [ ] `pnpm build` — succeeds.
- [ ] `pnpm biome check .` — zero new violations.
- [ ] Security review Task 10 complete, all P1/P2 findings resolved.
- [ ] `src/lib/crypto/secret-box.ts` is the ONLY AES-256-GCM module in the repo (run `grep -r "createCipheriv" src/` — only one file).
- [ ] `SECRET_MASK`, `isMasked`, `redactSecret`, `encryptSecret`, `decryptSecret`, `DecryptError` all exported from `src/lib/crypto/secret-box.ts`.
- [ ] `src/lib/config/repo.ts` exists and exports `setAppConfig`, `getAppConfig`, `deleteAppConfig`, `setAppConfigJson`, `getAppConfigJson`. No other module accesses `app_config` directly.
- [ ] `logAudit`, `verifyAuditChain`, and `AuditAction` in `src/lib/audit/index.ts` match the frozen interface above exactly.
- [ ] `AuditAction` union contains ONLY dotted verbs from §1d. No `user.role_change`, `doc.permission_grant`, `doc.permission_revoke`, `doc.permission_change`, `oidc_config`, `login_locked`, `session_revoke`, `mfa_enable`, `mfa_disable` strings appear anywhere in the repo (`grep -r "role_change\|permission_grant\|permission_revoke\|permission_change\|oidc_config\|login_locked" src/` returns nothing).
- [ ] Migrations 0020 and 0021 exist as `.sql` files and are registered in `_journal.json` at idx 20 and 21.
- [ ] `app_config` table is defined in `src/db/schema.ts` as `appConfig`.
- [ ] `audit_log` schema has `ip`, `prev_hash`, `entry_hash` (all text, nullable) and `target_id` typed as `text`.

---

## Hand-off to downstream groups

Once all acceptance criteria pass and the security review is closed, Phase 0 is complete. Downstream groups may proceed:

- **Group B** (SMTP): import from `@/lib/config/repo` (`setAppConfig`/`getAppConfig`/`getAppConfigJson`/`setAppConfigJson`) for all SMTP config; import `SECRET_MASK`/`isMasked`/`redactSecret` from `@/lib/crypto/secret-box` for masking; do NOT create `app_config` again and do NOT create `src/lib/config/app-config-repo.ts`.
- **Group G** (security): read/write OIDC client secret and other instance secrets via `@/lib/config/repo`; import `logAudit`/`verifyAuditChain` from `@/lib/audit` — extend `AuditAction` ONLY by adding to the union using the §1d canonical dotted verbs; G's migration is **0023** (OIDC/lockouts only — NOT audit_log or app_config).
- **Group A** (multi-user): extend `AuditAction` with user/doc verbs by adding to the Phase-0 union using ONLY dotted verbs (`user.role`, `doc.share`, `doc.unshare` — NOT `user.role_change`, `doc.permission_grant` etc.); migration is **0022**; do NOT re-create `app_config` or `audit_log` migrations.
- **backup-sync**: import from `@/lib/config/repo` for all S3/git secret config; env var is `PARCHMENT_SECRET_KEY` (not `APP_SECRET`); do NOT access `app_config` directly.
