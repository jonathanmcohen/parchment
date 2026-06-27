# Backup / Sync cluster — v0.2.0 implementation plan

**Spec items:** F1 (S3 config UI), D1–D2 (instance-to-instance migrate), E1–E4 (git sync), I3 (backup verification).

**Locked decisions (do not revisit):**

- Encrypted secrets: the `app_config` table (key/value, `value` is AES-256-GCM ciphertext) is created ONCE in migration **0020** by Phase 0 — backup-sync does NOT create this table or its migration. The master key is `PARCHMENT_SECRET_KEY` env (**base64-encoded 32 bytes**, required when any secret is stored). S3 creds, git token/SSH key, and migrate token all go here. The `settings` table stores non-secret config JSON by owner; `app_config` stores instance-level secrets (no ownerId).
- S3: env vars `BACKUP_S3_*` take precedence over DB config (env → UI config). Live-apply after save re-registers the `s3-backup` scheduler job without a restart. `isS3Configured()` is extended to also check DB config; the scheduler singleton gains a `reconfigureJob` method.
- D (instance migrate): HTTPS + a scoped `MIGRATE_TOKEN` bearer, pushed to the target's `POST /api/migrate/receive` which calls `restoreWorkspaceBackup`. Dry-run returns a manifest diff without writing. The token is stored encrypted in `app_config`.
- E (git sync): isomorphic-git `push` via HTTPS token auth (SSH key is v0.2.1). `git.push` with `http: httpPlugin` (already available at `isomorphic-git/http/node`). Disk is source-of-truth: auto-commit on every watcher write (already done) + periodic push via a new `git-sync` scheduler job. Non-fast-forward → surface as an error in `git_sync_status` DB row; never auto-merge; never rebase. Token encrypted in `app_config`.
- I3: `backup-verify` scheduler job (weekly by default, **ON by default — no env var gate**) — backup-sync OWNS this registration. Calls `createWorkspaceBackup` for the first owner, then `parseWorkspaceBackup` on the bytes; any failure sets `lastStatus: 'error'`. No separate DB/disk required. I does NOT register a `backup-verify` job; I only adds the dashboard surface that reads the job state from backup-sync's registration.
- Nav promotion: add a top-level `/settings/backup` route (not under `/admin`). The old `/settings/admin/backup` stays as a redirect.
- TDD throughout: write the failing test first, then implement.

**Migration:** backup-sync has NO migration of its own — S3, git, and migrate config all live in the Phase-0 `app_config` table (migration 0020). Migration **0026** is reserved for backup-sync ONLY if a non-`app_config` table is later found necessary; as of this plan, it is not needed.

**Build order:** Phase 0 (secret-box + app_config 0020) must land first → F1 (S3 UI) → D (migrate) → E (git sync) → I3 (backup verify) → nav wiring.

**Task count: 30 tasks** (lettered F, D, E, I, N for nav — FOUND-T1 through FOUND-T4 removed; those belong to Phase 0).

---

## FOUNDATION — Prerequisite: Phase 0 (consume, do not redefine)

> **Canonical reconciliation §1a + §1b + §2:** backup-sync does NOT build its own crypto module or `app_config` table. Both are built ONCE in Phase 0 and consumed here. Do not create `src/lib/config/crypto.ts`. Do not run `drizzle-kit generate` for migration 0020.

### FOUND-PRE — Verify Phase 0 is landed before starting backup-sync tasks

Phase 0 provides:
- `src/lib/crypto/secret-box.ts` — exports `encryptSecret`, `decryptSecret`, `SECRET_MASK`, `isMasked`, `redactSecret`. Envelope format: `v1:<b64 iv>:<b64 ct>:<b64 tag>`.
- `src/lib/config/repo.ts` (`server-only`) — exports `setAppConfig`, `getAppConfig`, `deleteAppConfig`, `setAppConfigJson`, `getAppConfigJson`. Each `set*` encrypts via secret-box; each `get*` decrypts.
- Migration `0020` — creates `app_config(key text primary key, value text not null, updated_at timestamptz)`.
- Master key env var: **`PARCHMENT_SECRET_KEY`** (base64-encoded 32 bytes). Validated at boot in `src/lib/env.ts`. If absent, secret WRITES return 503; reads of unencrypted/legacy config still work.

All backup-sync imports use:
```ts
import { encryptSecret, decryptSecret } from '@/lib/crypto/secret-box'
import { setAppConfig, getAppConfig, deleteAppConfig, setAppConfigJson, getAppConfigJson } from '@/lib/config/repo'
```

**No FOUND-T1 through FOUND-T4 tasks exist in this plan.** They belong to Phase 0. If Phase 0 is not yet merged, block on it before starting any F1/D/E/I3 task.

---

## F1 — S3 backup config in Settings

### F1-T1 — Failing test: `resolveS3Config` (env > DB precedence)

**File:** `tests/unit/s3-config.test.ts`

Import a new function `resolveS3Config(): Promise<S3Config | null>`. `S3Config` is:

```ts
interface S3Config {
  endpoint: string; bucket: string; accessKeyId: string;
  secretAccessKey: string; region: string;
  prefix: string; scheduleHours: number; enabled: boolean;
}
```

Tests:
- When all four `BACKUP_S3_*` env vars are set: env values win (bucket/endpoint/keys from env; prefix/scheduleHours/enabled from DB or defaults).
- When env vars are absent but DB config has `s3.enabled=true` + all four secrets: returns DB config.
- When env vars set endpoint but not bucket: returns `null` (partial env config is invalid — same rule as today's `isS3Configured`).
- When neither env nor DB: returns `null`.

Mock `@/lib/config/repo` to inject DB-side values.

Run: `pnpm test tests/unit/s3-config.test.ts` — must fail.

### F1-T2 — Implement: `src/lib/backup/s3-config.ts`

```ts
export async function resolveS3Config(): Promise<S3Config | null>
export async function saveS3Config(cfg: Partial<S3Config> & { secretAccessKey?: string }): Promise<void>
export async function testS3Connection(cfg: S3Config): Promise<{ ok: true } | { ok: false; error: string }>
```

- `resolveS3Config`: reads env first; if all four required env vars present, they win for the secrets; prefix/schedule/enabled can still come from DB. If env is absent, reads from DB via `getAppConfig` for secrets and `getAppConfigJson` for the rest.
- `saveS3Config`: stores each field in `app_config` keyed as `s3.endpoint`, `s3.bucket`, `s3.accessKeyId`, `s3.secretAccessKey`, `s3.region`, `s3.prefix`, `s3.scheduleHours`, `s3.enabled`. The `secretAccessKey` field is only written when provided (never overwritten with a masked placeholder).
- `testS3Connection`: dynamically imports `@aws-sdk/client-s3`, attempts `HeadBucketCommand`, returns `{ ok: true }` or `{ ok: false, error: sanitizedMessage }`. Never leaks the secret key in the error string.

Update `isS3Configured()` in `src/lib/backup/s3.ts` to call `resolveS3Config()` (making it async); update all call-sites. **Or** — simpler — keep `isS3Configured` sync (env-only) and add `isS3Active(): Promise<boolean>` that checks both env and DB. The scheduler uses `isS3Active`. Decide: use `isS3Active` (async) in the scheduler so sync callers are not broken.

Run: `pnpm test tests/unit/s3-config.test.ts` — must now pass.

### F1-T3 — Failing test: scheduler live re-register

**File:** `tests/unit/scheduler-reconfig.test.ts`

The `SchedulerSingleton` class needs a `reconfigureS3Job(enabled: boolean): void` method. Tests:

- When S3 starts unconfigured: `scheduler.getState()` has no `s3-backup` job.
- After `reconfigureS3Job(true)` is called: `scheduler.getState()` includes an `s3-backup` job.
- After `reconfigureS3Job(false)`: `s3-backup` is removed.
- Calling `reconfigureS3Job(true)` twice does not register two jobs.

Use the pure `Scheduler` class from `./jobs.ts` directly (not the singleton), so no global state leaks between tests.

Run: `pnpm test tests/unit/scheduler-reconfig.test.ts` — must fail.

### F1-T4 — Implement: `reconfigureS3Job` + `unregister` on `Scheduler`

In `src/lib/schedules/jobs.ts`: add `unregister(name: string): void` — removes from `jobs` and `state` maps. Does nothing if unknown. An in-flight job is NOT interrupted (it runs to completion); the state is just gone after.

In `src/lib/schedules/scheduler.ts`: add `reconfigureS3Job(enabled: boolean): void` to `SchedulerSingleton`. If `enabled` and no `s3-backup` job: register it. If `!enabled` and `s3-backup` exists: unregister it. Also update `registerDefaults` to call `isS3Active()` (async); since `registerDefaults` is called in `start()`, make `start()` async and await it. Update `instrumentation.ts` call-site accordingly.

Run: `pnpm test tests/unit/scheduler-reconfig.test.ts` — must now pass.

### F1-T5 — Failing test: S3 config API routes

**File:** `tests/unit/s3-config-api.test.ts`

Test `GET /api/settings/backup/s3` and `PUT /api/settings/backup/s3`:

- `GET` for non-admin returns 403.
- `GET` for admin returns `{ endpoint, bucket, region, prefix, scheduleHours, enabled }` with `secretAccessKey: '***'` (masked) or `null` when unset.
- `PUT` with valid body saves config and calls `reconfigureS3Job`.
- `PUT` with missing required fields (endpoint + bucket) returns 400.
- `PUT` with only `enabled: false` disables without requiring secrets.
- `POST /api/settings/backup/s3/test` calls `testS3Connection` and returns `{ ok: true }` or `{ ok: false, error }`.

Mock `@/lib/backup/s3-config` and `@/lib/schedules/scheduler` via `vi.mock`.

Run: `pnpm test tests/unit/s3-config-api.test.ts` — must fail.

### F1-T6 — Implement: backup settings API routes

New route files:

```
src/app/api/settings/backup/s3/route.ts          — GET + PUT
src/app/api/settings/backup/s3/test/route.ts     — POST
src/app/api/settings/backup/s3/objects/route.ts  — GET (list S3 objects for restore picker)
```

- `GET /api/settings/backup/s3`: `requireAdmin`, calls `resolveS3Config()`, masks `secretAccessKey` → `'***'` if set, returns JSON.
- `PUT /api/settings/backup/s3`: `requireAdmin`, validates body (zod or manual), calls `saveS3Config`, calls `scheduler.reconfigureS3Job(cfg.enabled)`, returns `{ ok: true }`.
- `POST /api/settings/backup/s3/test`: `requireAdmin`, reads current config (or merges request body for unsaved config), calls `testS3Connection`, returns result.
- `GET /api/settings/backup/s3/objects`: `requireAdmin`, uses `ListObjectsV2Command` with prefix filter, returns `{ objects: Array<{ key, lastModified, size }> }` (max 100), paginated via `continuationToken` query param.

All routes: `export const runtime = 'nodejs'` + `export const dynamic = 'force-dynamic'`.

Run: `pnpm test tests/unit/s3-config-api.test.ts` — must now pass. Run `pnpm typecheck`.

### F1-T7 — Failing test: restore-from-S3 route

**File:** `tests/unit/s3-restore-api.test.ts`

`POST /api/settings/backup/s3/restore` with body `{ key: 'parchment-backup-…zip' }`:

- Admin-only (403 for non-admin).
- Calls `GetObjectCommand` to fetch the zip bytes.
- Calls `restoreWorkspaceBackup(user.id, bytes)`.
- Returns `{ created, skipped, warnings }`.
- If the S3 key contains `..` or starts with `/`: returns 400 (path traversal guard).
- If S3 fetch fails: returns 502 with sanitized error.

Run: `pnpm test tests/unit/s3-restore-api.test.ts` — must fail.

### F1-T8 — Implement: `src/app/api/settings/backup/s3/restore/route.ts`

Implement as above. Re-use the existing `safeEntryName` pattern for the key check. Dynamic import `@aws-sdk/client-s3` so the SDK stays out of the bundle when unconfigured.

Run: `pnpm test tests/unit/s3-restore-api.test.ts` — must now pass.

### F1-T9 — Failing e2e / DOM probe: S3 config form renders + submits

**File:** `tests/e2e/backup-s3-config.authed.spec.ts`

Playwright spec against the new `/settings/backup` page:

```ts
test('S3 config form — admin can open, fill, save, see masked key', async ({ page }) => {
  await page.goto('/settings/backup')
  await expect(page.getByRole('heading', { name: 'S3 backup' })).toBeVisible()
  // The form fields exist
  await expect(page.getByLabel('Endpoint')).toBeVisible()
  await expect(page.getByLabel('Bucket')).toBeVisible()
  // Fill and submit
  await page.getByLabel('Endpoint').fill('https://minio.local:9000')
  await page.getByLabel('Bucket').fill('parchment')
  await page.getByLabel('Access key ID').fill('AKIA')
  await page.getByLabel('Secret access key').fill('shh')
  await page.getByRole('button', { name: 'Save' }).click()
  // Secret key is now masked
  await expect(page.getByLabel('Secret access key')).toHaveValue('***')
})
```

This test requires the page component to exist. Run — must fail (page 404).

### F1-T10 — Implement: `/settings/backup` page + promote nav

New files:

```
src/app/(app)/settings/backup/page.tsx                     — server component (admin-gated)
src/app/(app)/settings/backup/S3ConfigForm.tsx             — client island
src/app/(app)/settings/backup/S3ObjectPicker.tsx           — client island (list + pick for restore)
src/app/(app)/settings/admin/backup/page.tsx               — REDIRECT to /settings/backup
```

The server component at `/settings/backup`:
- Calls `requireAdmin()`.
- Reads current S3 config via `resolveS3Config()`, masks secret.
- Reads scheduler state for `s3-backup` job (last run, next run, status, error).
- Renders three sections: Download/Restore (reuse existing markup from old `/settings/admin/backup`), S3 config form, S3 restore-from-S3 picker.

`S3ConfigForm` client island: controlled form with all S3 fields. On load, secret field shows `'***'` if already set. Typing in the secret field replaces the mask with the real input (standard password-field pattern). On submit: `PUT /api/settings/backup/s3`. Shows success/error inline. Has a "Test connection" button that calls `POST /api/settings/backup/s3/test` with the current unsaved values.

`S3ObjectPicker` client island: button "Restore from S3…" → opens an inline picker that `GET /api/settings/backup/s3/objects`, shows a list of backup files (key + size + date), user picks one, confirms → `POST /api/settings/backup/s3/restore { key }`.

**Nav promotion** (`src/app/(app)/settings/_nav.tsx`): add `{ href: '/settings/backup', label: 'Backup' }` between `Admin` and `Developer`. The old admin/backup link in `admin/page.tsx` stays (links to the new URL).

**Old admin/backup redirect** (`src/app/(app)/settings/admin/backup/page.tsx`): replace body with `redirect('/settings/backup')`.

Update `src/app/(app)/settings/admin/page.tsx` admin card to point to `/settings/backup`.

Run: `pnpm test tests/e2e/backup-s3-config.authed.spec.ts` — must now pass. Run `pnpm lint && pnpm typecheck`.

---

## D — Instance-to-instance migrate

### D-T1 — Failing test: migrate token generation + validation

**File:** `tests/unit/migrate-token.test.ts`

New module `src/lib/migrate/token.ts`:

- `generateMigrateToken(): string` — CSPRNG, 32 bytes, base64url. Must be ≥ 40 chars.
- `hashMigrateToken(token: string): string` — sha256 hex (same pattern as PAT).
- `verifyMigrateToken(incoming: string, storedHash: string): boolean` — constant-time compare via `timingSafeEqual`.

Tests:
- `generateMigrateToken()` produces a string ≥ 40 chars.
- Two calls produce different strings.
- `hashMigrateToken(t) === hashMigrateToken(t)` (deterministic).
- `verifyMigrateToken(t, hashMigrateToken(t))` is true.
- `verifyMigrateToken('bad', hashMigrateToken(t))` is false.
- Timing: both branches call `timingSafeEqual` (no early-exit on length mismatch — pad to fixed 64 hex chars before comparing).

Run: `pnpm test tests/unit/migrate-token.test.ts` — must fail.

### D-T2 — Implement: `src/lib/migrate/token.ts`

```ts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function generateMigrateToken(): string { ... }
export function hashMigrateToken(token: string): string { ... }
export function verifyMigrateToken(incoming: string, storedHash: string): boolean { ... }
```

For `verifyMigrateToken`: compute both hashes as 64-char hex buffers (fixed length), then `timingSafeEqual(Buffer.from(aHash), Buffer.from(bHash))`.

Run: `pnpm test tests/unit/migrate-token.test.ts` — must pass.

### D-T3 — Failing test: `/api/migrate/receive` (target endpoint)

**File:** `tests/unit/migrate-receive-api.test.ts`

`POST /api/migrate/receive`:
- With no `Authorization` header: 401.
- With `Authorization: Bearer bad-token` (hash doesn't match stored): 403.
- With valid token and a valid backup zip body: calls `restoreWorkspaceBackup` for the admin user and returns `{ created, skipped, warnings }`.
- With valid token but malformed zip: returns 400.
- `?dry=true`: parses the backup, returns manifest diff (new doc count vs existing), does NOT write.

Dry-run response schema: `{ dryRun: true, wouldCreate: number, wouldSkip: number, existingCount: number }`.

Mock `@/lib/auth/guard`, `@/lib/backup/service`, `@/lib/migrate/token`, `@/lib/config/repo` (to inject stored token hash).

Run: `pnpm test tests/unit/migrate-receive-api.test.ts` — must fail.

### D-T4 — Implement: `src/app/api/migrate/receive/route.ts`

```ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) { ... }
```

Logic:
1. Extract `Authorization: Bearer <token>` header; if absent → 401.
2. Load stored hash from `getAppConfig('migrate.tokenHash')`; if absent → 401 (no token configured → receive endpoint is closed).
3. `verifyMigrateToken(incoming, storedHash)` → false → 403.
4. Identify the admin user (`requireAdmin` equivalent without cookie — use the first admin from DB).
5. Check `?dry=true` query param.
6. Buffer body as `Uint8Array` (max 100 MB; 413 if exceeded).
7. Dry-run: `parseWorkspaceBackup(bytes)` → count entries, compare against `listDocuments(adminUser.id)` count → return `{ dryRun: true, wouldCreate, wouldSkip, existingCount }`.
8. Normal: `restoreWorkspaceBackup(adminUser.id, bytes)` → return result.

Run: `pnpm test tests/unit/migrate-receive-api.test.ts` — must pass.

### D-T5 — Failing test: `/api/migrate/push` (source endpoint — push to target)

**File:** `tests/unit/migrate-push-api.test.ts`

`POST /api/migrate/push` with body `{ targetUrl: 'https://target.example', token: 'secret' }`:
- Admin-only (403 for non-admin).
- `targetUrl` must start with `https://` (reject `http://` to avoid sending tokens over clear-text). Returns 400 for `http://` or invalid URL.
- Calls `createWorkspaceBackup(user.id, ...)`, then POSTs the zip to `${targetUrl}/api/migrate/receive` with `Authorization: Bearer ${token}`.
- On network error: returns 502 with sanitized message.
- On target 4xx/5xx: returns `{ ok: false, targetStatus: N, targetBody: ... }`.
- On success: returns `{ ok: true, created, skipped, warnings }`.
- With `?dry=true`: POSTs to `${targetUrl}/api/migrate/receive?dry=true` and returns the dry-run manifest.

Mock `fetch` (global) via `vi.stubGlobal`.

Run: `pnpm test tests/unit/migrate-push-api.test.ts` — must fail.

### D-T6 — Implement: `src/app/api/migrate/push/route.ts`

```ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```

URL validation: `new URL(targetUrl)` must have `protocol === 'https:'`. The `token` param is the bearer token for the target — it is the caller's responsibility; we do not look up any stored token here (push is a one-shot operation, not necessarily the same token as stored in `app_config`).

Run: `pnpm test tests/unit/migrate-push-api.test.ts` — must pass.

### D-T7 — Failing test: migrate token management API

**File:** `tests/unit/migrate-token-api.test.ts`

`POST /api/settings/backup/migrate-token`:
- Admin-only.
- Generates a new token via `generateMigrateToken()`, stores `hashMigrateToken(token)` in `app_config` as `migrate.tokenHash`.
- Returns `{ token }` (the plaintext, shown once).
- A second call regenerates (the old token is invalidated).

`DELETE /api/settings/backup/migrate-token`:
- Admin-only.
- Calls `deleteAppConfig('migrate.tokenHash')`.
- Returns `{ ok: true }`.

`GET /api/settings/backup/migrate-token`:
- Admin-only.
- Returns `{ configured: boolean }` — true if a hash is stored.

Run: `pnpm test tests/unit/migrate-token-api.test.ts` — must fail.

### D-T8 — Implement: `src/app/api/settings/backup/migrate-token/route.ts`

Implement GET + POST + DELETE as described above.

Run: `pnpm test tests/unit/migrate-token-api.test.ts` — must pass.

### D-T9 — Implement: migrate UI section in `/settings/backup`

Add a "Instance migration" section to the existing `/settings/backup` page server component and a new `MigrateSection.tsx` client island:

- Token management: "Generate receive token" button → shows the token once (copy prompt). "Revoke token" button. Status: "Receive endpoint: open / closed".
- Push to another instance: `<input>` for `Target URL` + `<input type="password">` for `Token`. "Test connection (dry run)" button → `POST /api/migrate/push?dry=true`. "Migrate now" button → `POST /api/migrate/push`. Shows `{ wouldCreate, existingCount }` for dry run; `{ created, skipped }` for live.

No new test needed (covered by e2e or manual verify).

---

## E — Git sync

### E-T1 — Failing test: `GitSyncConfig` parse + validate

**File:** `tests/unit/git-sync-config.test.ts`

New module `src/lib/git/sync-config.ts`:

```ts
export interface GitSyncConfig {
  remoteUrl: string       // HTTPS URL
  branch: string          // default 'main'
  token: string           // plaintext at runtime (stored encrypted)
  authorName: string      // default 'Parchment'
  authorEmail: string     // default 'parchment@localhost'
  scheduleHours: number   // default 24; 0 = push-on-change only
  enabled: boolean
}

export function parseGitSyncConfig(raw: unknown): GitSyncConfig | null
```

Tests:
- `parseGitSyncConfig({ remoteUrl: 'https://github.com/user/repo.git', branch: 'main', token: 'x', enabled: true })` returns a valid config with defaults filled.
- `parseGitSyncConfig({ remoteUrl: 'ssh://git@github.com/user/repo.git', ... })` returns `null` (SSH rejected — HTTPS only).
- `remoteUrl` must start with `https://` (same reason as migrate push: token auth over clear-text is a vulnerability).
- `scheduleHours` is clamped to `[0, 168]` (0 to one week).
- Missing `remoteUrl` returns `null`.
- `branch` sanitized: no `..`, no spaces, max 100 chars.

Run: `pnpm test tests/unit/git-sync-config.test.ts` — must fail.

### E-T2 — Implement: `src/lib/git/sync-config.ts`

Implement `parseGitSyncConfig` as described. Export the type and the defaults.

Run: `pnpm test tests/unit/git-sync-config.test.ts` — must pass.

### E-T3 — Failing test: `pushToRemote` (the isomorphic-git push wrapper)

**File:** `tests/unit/git-push.test.ts`

New module `src/lib/git/remote.ts`:

```ts
export async function pushToRemote(config: GitSyncConfig): Promise<PushResult>

export type PushResult =
  | { ok: true; oid: string }
  | { ok: false; error: 'not_configured' | 'non_fast_forward' | 'auth_failed' | 'network' | 'unknown'; message: string }
```

Tests (all mock `isomorphic-git` and `isomorphic-git/http/node`):

- Successful push: `git.push` resolves with `{ ok: true }` → returns `{ ok: true, oid: currentOid }`.
- Non-fast-forward: `git.push` throws an error whose `code` is `'PushRejectedError'` or message contains `'rejected'` → `{ ok: false, error: 'non_fast_forward', message: ... }`.
- Auth failure: error message contains `'401'` or `'403'` → `{ ok: false, error: 'auth_failed', message: 'auth failed (check token)' }` (sanitized — never echoes the token).
- Network error: `fetch` throws → `{ ok: false, error: 'network', message: sanitized }`.
- `config.enabled === false` → returns `{ ok: false, error: 'not_configured', message: '...' }` without calling `git.push`.

Run: `pnpm test tests/unit/git-push.test.ts` — must fail.

### E-T4 — Implement: `src/lib/git/remote.ts`

```ts
import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import fs from 'node:fs'
import type { GitSyncConfig } from './sync-config'
import { gitDir } from './repo'

export async function pushToRemote(config: GitSyncConfig): Promise<PushResult> {
  if (!config.enabled) return { ok: false, error: 'not_configured', message: 'git sync is disabled' }
  try {
    // Ensure the remote is set to the configured URL
    const remotes = await git.listRemotes({ fs, dir: gitDir() })
    const origin = remotes.find(r => r.remote === 'origin')
    if (!origin || origin.url !== config.remoteUrl) {
      await git.addRemote({ fs, dir: gitDir(), remote: 'origin', url: config.remoteUrl, force: true })
    }
    await git.push({
      fs, http, dir: gitDir(),
      remote: 'origin', ref: config.branch,
      onAuth: () => ({ username: 'x-token', password: config.token }),
    })
    const oid = await git.resolveRef({ fs, dir: gitDir(), ref: 'HEAD' })
    return { ok: true, oid }
  } catch (err) {
    return classifyPushError(err)
  }
}
```

The `classifyPushError` function: checks `err.code`, `err.message` for `'PushRejectedError'` / `'rejected'` → `non_fast_forward`; `'401'`/`'403'`/`'Unauthorized'`/`'Forbidden'` → `auth_failed` (message sanitized, no token); network/fetch errors → `network`.

Run: `pnpm test tests/unit/git-push.test.ts` — must pass.

### E-T5 — Failing test: `git-sync` scheduler job + non-fast-forward error surfacing

**File:** `tests/unit/git-sync-job.test.ts`

The `git-sync` scheduler job:
- Calls `resolveGitSyncConfig()` (reads `app_config`), returns `null` if unconfigured.
- If unconfigured: no-op (do NOT throw — this is off-unless-configured; the job stays registered but is a fast no-op).
- If configured: calls `pushToRemote(config)`.
- On `PushResult.ok === true`: records last push metadata in `app_config` as `git.lastPush` (JSON: `{ oid, at: iso }`).
- On `PushResult.ok === false && error === 'non_fast_forward'`: stores `git.lastError` in `app_config` as `{ kind: 'non_fast_forward', at: iso, message }` AND throws so the scheduler records `lastStatus: 'error'`.
- Other errors: stores `git.lastError` AND throws.

Tests mock `@/lib/git/remote` and `@/lib/config/repo`.

Run: `pnpm test tests/unit/git-sync-job.test.ts` — must fail.

### E-T6 — Implement: `src/lib/git/sync-job.ts` + register in scheduler

```ts
// src/lib/git/sync-job.ts
export async function gitSyncJob(): Promise<void> { ... }
```

In `src/lib/schedules/scheduler.ts`, `registerDefaults`: add a parallel pattern to S3 — check `await resolveGitSyncConfig()` (async) and if enabled register `git-sync` with `intervalMs = config.scheduleHours * 3_600_000` (or 24h default). Also add `reconfigureGitSyncJob(enabled: boolean, scheduleHours?: number): void`.

**Push-on-change wiring**: in `src/lib/disk/watcher.ts`, after `commitPath`, fire-and-forget `void maybePushOnChange()`. Implement `maybePushOnChange` in `src/lib/git/remote.ts`: if `scheduleHours === 0` (push-on-change mode), call `pushToRemote`. Otherwise no-op. Errors are swallowed (best-effort) but written to `app_config` as `git.lastError` for status display.

Run: `pnpm test tests/unit/git-sync-job.test.ts` — must pass. Run `pnpm typecheck`.

### E-T7 — Failing test: git sync config API routes

**File:** `tests/unit/git-sync-api.test.ts`

`GET /api/settings/git-sync`:
- Admin-only.
- Returns `{ remoteUrl, branch, authorName, authorEmail, scheduleHours, enabled, tokenSet: boolean, lastPush, lastError }`. `token` is NEVER returned; `tokenSet: true/false`.

`PUT /api/settings/git-sync`:
- Admin-only.
- Body: `{ remoteUrl?, branch?, token?, authorName?, authorEmail?, scheduleHours?, enabled? }`.
- If `token` provided: store encrypted in `app_config` as `git.token`.
- If `token` is `''`: delete the stored token (revoke).
- Other fields stored as `git.config` (JSON).
- Calls `scheduler.reconfigureGitSyncJob(cfg.enabled, cfg.scheduleHours)`.
- Returns `{ ok: true }`.

`POST /api/settings/git-sync/push-now`:
- Admin-only.
- Calls `pushToRemote(config)` directly, returns the `PushResult`.

`POST /api/settings/git-sync/init`:
- Admin-only.
- Calls `ensureRepo()` (idempotent) then `pushToRemote(config)` (first-push).
- Returns `{ ok: true, oid? }` or error.

Run: `pnpm test tests/unit/git-sync-api.test.ts` — must fail.

### E-T8 — Implement: git sync API routes

New files:
```
src/app/api/settings/git-sync/route.ts           — GET + PUT
src/app/api/settings/git-sync/push-now/route.ts  — POST
src/app/api/settings/git-sync/init/route.ts      — POST
```

And `src/lib/git/sync-config.ts` additions:

```ts
export async function resolveGitSyncConfig(): Promise<GitSyncConfig | null>
export async function saveGitSyncConfig(cfg: Partial<GitSyncConfig> & { token?: string }): Promise<void>
```

`resolveGitSyncConfig` reads `git.config` (JSON) and `git.token` from `app_config`; returns `null` if `remoteUrl` is absent or `enabled === false`.

Run: `pnpm test tests/unit/git-sync-api.test.ts` — must pass.

### E-T9 — Implement: git sync UI section in `/settings/backup`

Add a "Git sync" section to `/settings/backup` with a new `GitSyncForm.tsx` client island:

- Fields: Remote URL, Branch, Token (password input — shows `•••` if set, clear to revoke), Author name, Author email, Schedule (dropdown: "Push on each save" / every N hours), Enable toggle.
- Buttons: "Save", "Push now" (calls `POST /api/settings/git-sync/push-now`), "Initialize & first push" (calls `POST /api/settings/git-sync/init`).
- Status section: last push oid + timestamp, last error (with kind highlighted for `non_fast_forward`).
- Non-fast-forward error shows a distinct warning callout: "Remote has diverged. Force-push is not available. Resolve manually and re-push."

No new unit test (covered by the existing API tests + manual verify).

---

## I3 — Backup verification (scheduled restore-test)

### I3-T1 — Failing test: `backupVerifyJob` detects restorable vs. corrupt backup

**File:** `tests/unit/backup-verify-job.test.ts`

New module `src/lib/backup/verify-job.ts`:

```ts
export async function backupVerifyJob(): Promise<void>
```

Tests:
- When `createWorkspaceBackup` returns valid bytes and `parseWorkspaceBackup` succeeds with `warnings.length === 0`: records `verify.lastResult = { ok: true, docCount, at }` in `app_config`. Does NOT throw.
- When `parseWorkspaceBackup` throws (corrupt backup): records `verify.lastResult = { ok: false, error: message, at }` AND throws so the scheduler marks `lastStatus: 'error'`.
- When `parseWorkspaceBackup` returns non-zero warnings: records `{ ok: 'warn', warnings, docCount, at }` AND throws (treat partial-corruption as an error).
- When no users exist: records `{ ok: 'skipped', at }`. Does NOT throw (fresh empty install should not alarm).

Mock `@/lib/backup/service`, `@/db`.

Run: `pnpm test tests/unit/backup-verify-job.test.ts` — must fail.

### I3-T2 — Implement: `src/lib/backup/verify-job.ts`

```ts
import 'server-only'
import { db, schema } from '@/db'
import { setAppConfigJson } from '@/lib/config/repo'
import { createWorkspaceBackup } from './service'
import { parseWorkspaceBackup } from './archive'

export async function backupVerifyJob(): Promise<void> {
  const [firstUser] = await db.select({ id: schema.users.id }).from(schema.users).limit(1)
  if (!firstUser) {
    await setAppConfigJson('verify.lastResult', { ok: 'skipped', at: new Date().toISOString() })
    return
  }
  const at = new Date().toISOString()
  const bytes = await createWorkspaceBackup(firstUser.id, at)
  const parsed = await parseWorkspaceBackup(bytes) // throws on fundamentally corrupt
  if (parsed.warnings.length > 0) {
    await setAppConfigJson('verify.lastResult', { ok: 'warn', warnings: parsed.warnings, docCount: parsed.entries.length, at })
    throw new Error(`Backup verify found ${parsed.warnings.length} warning(s): ${parsed.warnings[0]}`)
  }
  await setAppConfigJson('verify.lastResult', { ok: true, docCount: parsed.entries.length, at })
}
```

Run: `pnpm test tests/unit/backup-verify-job.test.ts` — must pass.

### I3-T3 — Failing test: scheduler registers `backup-verify` job

**File:** `tests/unit/backup-verify-scheduler.test.ts`

After `scheduler.start()`: `scheduler.getState()` includes a `backup-verify` job with `intervalMs` of 7 days (`7 * 24 * 3_600_000`). The job is ON BY DEFAULT (zero-config; no env var gates it). Test uses the pure `Scheduler` core (not the singleton) with `backupVerifyJob` mocked to a no-op.

Run: `pnpm test tests/unit/backup-verify-scheduler.test.ts` — must fail (job not registered).

### I3-T4 — Implement: register `backup-verify` in `scheduler.ts`

In `registerDefaults()`, add:

```ts
this.core.register({
  name: 'backup-verify',
  intervalMs: 7 * DAY_MS,
  run: backupVerifyJob,
})
```

Run: `pnpm test tests/unit/backup-verify-scheduler.test.ts` — must pass.

### I3-T5 — Implement: `GET /api/settings/backup/verify-status` + UI section

Route `src/app/api/settings/backup/verify-status/route.ts`:
- Admin-only.
- Returns `{ schedulerState: JobState | null, lastResult: VerifyResult | null }` where `VerifyResult` is read from `getAppConfigJson('verify.lastResult', null)`.

In `/settings/backup` page: add a "Backup health" section (server-side reads the scheduler state + `verify.lastResult`). Shows: last verify timestamp, doc count, any warnings. A "Verify now" button calls `POST /api/schedules/backup-verify/run` (the existing generic schedule-run route).

No new unit test required (scheduler-run route is already tested; the status display is thin server-side read).

---

## N — Nav + admin wiring

### N-T1 — Update `_nav.tsx` and admin page

In `src/app/(app)/settings/_nav.tsx`: add `{ href: '/settings/backup', label: 'Backup' }` between `'Admin'` and `'Developer'` entries.

In `src/app/(app)/settings/admin/page.tsx`: update the Backup card `href` from `/settings/admin/backup` to `/settings/backup`.

In `src/app/(app)/settings/admin/backup/page.tsx`: replace content with `redirect('/settings/backup')`. Keep the file so deep-links redirect cleanly.

Test: `pnpm test tests/e2e/a11y.authed.spec.ts` must still pass (no new a11y violations).

---

## Integration tests

### INT-T1 — Integration: S3 config round-trip (mock + manual MinIO note)

**File:** `tests/integration/s3-config.test.ts`

Use Testcontainers for Postgres (same pattern as `disk-mirror.test.ts`). Mock the `@aws-sdk/client-s3` calls (no MinIO container). Tests:

- `saveS3Config(...)` then `resolveS3Config()` returns the saved config with secrets decrypted correctly.
- Env vars override DB config (set `process.env.BACKUP_S3_ENDPOINT` after saving a different value to DB — `resolveS3Config()` returns the env value).
- Saving with `secretAccessKey: undefined` does not overwrite an existing stored secret.

**Manual MinIO check** (document in plan): run `docker run -d -p 9000:9000 -e MINIO_ROOT_USER=minio -e MINIO_ROOT_PASSWORD=miniominio minio/minio server /data`, set env vars, trigger `POST /api/settings/backup/s3/test`. Confirm `{ ok: true }`.

### INT-T2 — Integration: migrate push → receive round-trip

**File:** `tests/integration/migrate.test.ts`

Spin up TWO Testcontainers Postgres instances (or reuse one DB with two owner users). Test:

- Create docs on "source" owner.
- `createWorkspaceBackup(sourceOwner, ...)` → bytes.
- Call the `receive` route handler directly (not via HTTP) with valid token: confirm `restoreWorkspaceBackup` is called and docs appear.
- Call with wrong token: 403.
- Dry-run returns `wouldCreate` equal to doc count, `existingCount` correct.
- Corrupt backup (modify zip bytes) → 400.

This test does NOT need real HTTP between processes — call the route handler functions directly.

### INT-T3 — Integration: git sync push (mocked remote)

**File:** `tests/integration/git-sync.test.ts`

Real Postgres + real temp dir. Mock `isomorphic-git`'s `push` to resolve/reject. Tests:

- `ensureRepo()` + commit a file + `pushToRemote(config)` with mock returning success: result is `{ ok: true }`.
- Mock returns `{ code: 'PushRejectedError' }`: result is `{ ok: false, error: 'non_fast_forward' }`. `git.lastError` is written to `app_config`.
- `gitSyncJob()` called when unconfigured: no-op (no throw).
- `gitSyncJob()` called when `scheduleHours === 0` but watcher fires: `maybePushOnChange()` calls `pushToRemote`.

---

## Verification bar (no placeholders)

The following must be true before any PR is merged:

| Area | What passes |
|---|---|
| Config crypto (Phase 0) | `tests/unit/config-crypto.test.ts` — owned by Phase 0, not backup-sync; must be green before backup-sync starts |
| Encrypted config repo (Phase 0) | `tests/unit/config-repo.test.ts` — owned by Phase 0; backup-sync mocks `@/lib/config/repo` in its own unit tests |
| Env precedence | `tests/unit/s3-config.test.ts` — env beats DB, partial env = null |
| Scheduler live re-register | `tests/unit/scheduler-reconfig.test.ts` — add/remove s3-backup without restart |
| Migrate token forged-token rejected | `tests/unit/migrate-receive-api.test.ts` — wrong token → 403 |
| Git non-fast-forward surfaced | `tests/unit/git-push.test.ts` — PushRejectedError → non_fast_forward result; NOT a silent no-op |
| Backup verify detects corrupt | `tests/unit/backup-verify-job.test.ts` — parseWorkspaceBackup throw → job throws + records error |
| S3 config form DOM probe | `tests/e2e/backup-s3-config.authed.spec.ts` — form renders, save masks key |
| Full test suite | `pnpm test` (lint + typecheck + unit + integration + e2e-a11y) green |

**Manual MinIO check** (not automated — document in PR description):
```
docker run -d -p 9000:9000 --name minio \
  -e MINIO_ROOT_USER=minio \
  -e MINIO_ROOT_PASSWORD=miniominio \
  minio/minio server /data
```
Create bucket `parchment`, configure via the new Settings > Backup > S3 form, click "Test connection" → must see success. Trigger "Back up to S3 now" → object appears in MinIO console. Click "Restore from S3" → pick the object → confirm document count matches.

---

## Unresolved questions

1. **`PARCHMENT_SECRET_KEY` bootstrap** — what happens on a fresh install that has never set this env var and the admin tries to configure S3 via UI? Plan: the PUT route returns 503 with `{ error: 'secret_key_not_configured', hint: 'Set PARCHMENT_SECRET_KEY to a base64-encoded 32-byte value in your environment (e.g. openssl rand -base64 32).' }`. The Settings UI shows a callout explaining this. This is a one-time operator action.

2. **Git sync + isomorphic-git push with HTTPS tokens** — isomorphic-git's `onAuth` callback injects `username` + `password`; GitHub and Gitea both accept a PAT as the password with any username. GitLab also accepts this. Confirm against each before E-T4. Known gap: fine-grained GitHub PATs require username to match the token owner. Plan: document in the UI "For GitHub fine-grained PATs, set Author name to your GitHub username."

3. ~~**Migration 0020 key ordering**~~ — **RESOLVED by reconciliation:** backup-sync does NOT run `drizzle-kit generate` or own migration 0020. Phase 0 owns it. Migration 0026 is reserved for backup-sync only if a non-`app_config` table is later needed (currently none).

4. **Migrate receive: which user does the restore go to?** Plan uses the first admin in the DB (single-owner v0.2.0). For multi-user v0.2.x this will need a `targetUserId` param. Document as a known limitation in the API.
