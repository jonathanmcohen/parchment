# Group I — Ops / Self-hosted
## v0.2.0 implementation plan

**Spec items:** I1 health/ready/metrics, I2 quota + usage dashboard, I3 backup-verify (dashboard surface only — schedule is owned by backup-sync), I4 setup wizard, I5 upgrade tooling (reference only — migration owned by Group C), I6 maintenance/read-only mode, I7 structured logging + log levels, I8 CI container scan, I9 GDPR data export.

**Current state (read from code):**
- `/api/health` exists (returns `{ ok, pills }` via `probeAll()`). No `/healthz`, `/readyz`, or `/metrics` routes yet.
- `src/lib/health/probes.ts` has `probeDatabase`, `probeCollab`, `probeDisk`, `probeSearchIndex`, `probeOllama`, `probeS3`.
- Scheduler (`src/lib/schedules/`) is pure + singleton; three default jobs (trash-purge, db-heartbeat, s3-backup-if-configured). Started from `instrumentation.ts`.
- `/setup` route creates the owner account; it has no DB-connectivity test or SMTP/S3 opt-in steps.
- All logging is bare `console.error/warn/log` with namespace-tag prefixes like `[scheduler]`. No log levels, no structured JSON, no telemetry.
- Admin pages: `/settings/admin` (overview), `/settings/admin/health`, `/settings/admin/schedules`, `/settings/admin/backup`.
- `src/lib/env.ts` is the env config hub — extend it for new env vars.
- CI: `ci.yml` (typecheck/lint/unit/build/e2e-a11y); `release.yml` (gate + multi-arch publish). No container-scan step.
- File storage: `env.filesRoot` → `PARCHMENT_FILES_ROOT` or `${HOME}/parchment/files`. Assets at `${filesRoot}/.assets/${docId}/`.
- Schema has no quota column; `users` table has `id`, `email`, `name`, `passwordHash`, `role`, `createdAt`.
- Backup service: `src/lib/backup/service.ts` builds a lossless zip per user.

---

## Locked decisions

- **I1**: `/healthz` = liveness (always 200 unless the process is dead); `/readyz` = readiness (DB connectivity required, collab optional); `/metrics` = Prometheus text format (counters only — no histograms in v0.2.0). Compose `healthcheck` uses `/healthz`. These alias/extend existing `probeAll()` — no new probe logic.
- **I2**: Quota is enforced per user. Default = 0 (unlimited). Set via admin UI or env var `PARCHMENT_DEFAULT_QUOTA_MB`. Quota is checked at asset-upload (the only per-user binary write path today). Dashboard shows: per-user doc count + doc-content size (from DB), asset disk usage (from filesystem), DB total size.
- **I3**: Backup-verify (scheduled restore-test) job is registered and owned by backup-sync (on by default). I adds ONLY the dashboard surface on the existing backup admin page that reads the job's state from `scheduler.getState()`. I does NOT register the job or gate it behind `BACKUP_VERIFY` env var.
- **I4**: Extend `/setup` with two optional extra steps after account creation: (a) DB connectivity test (already passes at this point, but shown explicitly) and (b) SMTP status check (via `isSmtpConfigured()` from B — DB-backed, no SMTP env vars) and S3 env-var checklist.
- **I5**: Upgrade/migration tooling is cross-referenced from Group C (migrate.sh + Drizzle migrations). This group adds only a `/settings/admin/migrations` info page listing which migrations have run.
- **I6**: Maintenance mode = a global flag stored in `settings` table under `ownerId = SYSTEM_OWNER` key `'maintenance'`. Reads are always allowed. All non-GET API routes (and Server Actions that mutate) return 503 with `{ error: 'maintenance' }` when the flag is true. A banner is injected via the root layout.
- **I7**: Structured logging = a `src/lib/log.ts` logger that wraps `console.*` and emits JSON when `LOG_FORMAT=json`, or the existing namespace-prefixed format otherwise. Log level gating via `LOG_LEVEL` env var (error/warn/info/debug). No network telemetry ping — local structured logging only (§1j of reconciliation).
- **I8**: Trivy container scan in CI. Runs on the published image tag in `release.yml` after publish. Fails the workflow on `HIGH` or `CRITICAL` findings. Separate `scan` job so a security failure is clearly labelled.
- **I9**: GDPR export = `GET /api/user/export` (auth-gated). Produces a `.zip` containing: all the user's documents (same format as workspace backup), their profile JSON, and an `export-manifest.json`. Only that user's data — no cross-user leakage possible because all queries are `WHERE owner_id = user.id`.

---

## Dependency map

```
I7 (logger) → I1/I2/I3/I4/I6 (log calls)
I1 (healthz/readyz) → compose healthcheck [sequenced after C]
I6 (maintenance middleware) → I4 (setup must bypass it)
I2 (quota schema 0024) → I2 (dashboard) → I2 (asset enforce)
backup-sync (backup-verify job, on by default) → I3 (dashboard surface reads job state)
I8 (release.yml scan job) ← I1 (image must be published first)
I9 (export route) ← existing backup service (reuse)
```

---

## I7 — Structured logging + log levels

**Start here** — I7 is depended on by every other item's logging calls.

### I7-T1 — Failing tests: logger unit tests

**File:** `src/lib/__tests__/log.test.ts` (new)

Write tests BEFORE creating `log.ts`:

```
- log.error/warn/info/debug each call console.* once with the right level method
- When LOG_LEVEL=warn, debug and info calls are silenced (console.debug/info NOT called)
- When LOG_LEVEL=error, only error calls pass through
- When LOG_FORMAT=json, output is a parseable JSON string with { level, msg, ns, ts } fields
- When LOG_FORMAT is unset, output is the legacy '[ns] message' format (plain string)
```

### I7-T2 — Implement `src/lib/log.ts`

```typescript
// Level order: error=0, warn=1, info=2, debug=3
// LOG_LEVEL env var (default: 'info') gates which levels pass through.
// LOG_FORMAT=json emits JSON; otherwise emits '[ns] level: message'.
export function makeLogger(ns: string): Logger
export function log(level, ns, msg, ...args): void
```

Key constraints:
- Never import `@/db` or any server-side module — `log.ts` must be safe to import in client components too (log level filtering on client = always pass through; JSON format = never on client).
- Server-only callers (`instrumentation.ts`, scheduler, API routes) use `makeLogger('scheduler')` etc.
- Replace all `console.error('[scheduler] …')` call-sites in the same PR (see I7-T3).

**Files to modify:** `src/lib/schedules/scheduler.ts`, `src/lib/disk/watcher.ts`, `src/lib/disk/mirror.ts`, `src/lib/disk/reverse-sync.ts`, `src/db/index.ts`.

### I7-T3 — Replace bare console.* call-sites with structured logger

For each file identified in I7-T2, swap:
```
console.error('[scheduler] foo:', err)
→ log.error('[scheduler]', 'foo:', err)   // or makeLogger('scheduler').error(...)
```

This is mechanical — run `grep -rn "console\." src/lib src/app/api --include="*.ts"` to get the full list before starting. Touch only server-side files in this task; client-side `console.warn` in `clipboard-actions.ts` can stay.

**Verification:** `pnpm lint` (Biome has a `no-console` rule that can be enabled for server files only — check `biome.json` before toggling it). Unit tests from I7-T1 pass.

### I7-T4 — Add `LOG_LEVEL`, `LOG_FORMAT` to `src/lib/env.ts`

> **Reconciliation note (§1j):** No network telemetry ping. `https://telemetry.parchment.app/ping` does not exist; do NOT ship a `sendBootPing()` or `src/lib/telemetry.ts`. `PARCHMENT_TELEMETRY` env var is banned (§4). Local structured logging + log levels only.

```typescript
logLevel: (process.env.LOG_LEVEL ?? 'info') as LogLevel,
logFormat: process.env.LOG_FORMAT === 'json' ? 'json' : 'text',
```

---

## I1 — Health / ready / metrics endpoints + compose healthchecks

### I1-T1 — Failing tests: `/healthz`, `/readyz`, `/metrics` route contracts

**File:** `src/app/api/__tests__/health-routes.test.ts` (new, Vitest + msw or direct unit)

```
- GET /api/healthz always returns 200 { ok: true } (liveness — never hits DB)
- GET /api/readyz returns 200 when probeDatabase succeeds; 503 when it fails
- GET /api/readyz body contains { ok, checks: { db: 'up'|'down' } }
- GET /api/metrics returns 200 with Content-Type 'text/plain; version=0.0.4'
- GET /api/metrics body contains 'parchment_up 1'
- GET /api/metrics body contains 'parchment_request_count' counter
- GET /api/metrics body contains 'parchment_scheduler_job_count{job="..."}'
```

### I1-T2 — `src/app/api/healthz/route.ts` (liveness)

```typescript
// Liveness: the process is alive. Never checks DB or disk.
// Docker/Kubernetes healthcheck uses this — a DB blip must not restart the container.
export const dynamic = 'force-dynamic'
export async function GET() {
  return Response.json({ ok: true })
}
```

### I1-T3 — `src/app/api/readyz/route.ts` (readiness)

```typescript
// Readiness: the app can serve traffic. Requires DB connectivity.
// Returns 200 when DB probe is 'up'; 503 otherwise.
// Collab probe is advisory (included in body but does NOT flip the status).
export const dynamic = 'force-dynamic'
export async function GET() {
  const [db, collab] = await Promise.all([probeDatabase(), probeCollab()])
  const ok = db.status === 'up'
  return Response.json(
    { ok, checks: { db: db.status, collab: collab.status } },
    { status: ok ? 200 : 503 },
  )
}
```

### I1-T4 — `src/lib/metrics.ts` (Prometheus counter registry)

```typescript
// Server-singleton counter store. Prometheus text-format serializer.
// Counters: parchment_up, parchment_request_count (incremented by middleware),
//           parchment_scheduler_job_count{job,status} (incremented by scheduler).
// No histograms — v0.2.0 scope only.
export function incrementCounter(name: string, labels?: Record<string, string>): void
export function serializePrometheus(): string
```

Store on `globalThis` for HMR safety (same pattern as the scheduler singleton).

**File to modify:** `src/lib/schedules/scheduler.ts` — call `incrementCounter('parchment_scheduler_job_count', { job: name, status })` inside `execute()` after the try/catch.

**File to modify:** `src/middleware.ts` (create if absent) — increment `parchment_request_count` on each incoming request. Use `NextResponse.next()` and skip for static assets.

### I1-T5 — `src/app/api/metrics/route.ts` (Prometheus scrape endpoint)

```typescript
// Auth: requires admin session OR a Bearer token matching METRICS_TOKEN env var.
// METRICS_TOKEN allows Prometheus to scrape without a user session.
// Returns text/plain Prometheus exposition format.
export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  if (!await isMetricsAuthorized(req)) return new Response('Forbidden', { status: 403 })
  return new Response(serializePrometheus(), {
    headers: { 'Content-Type': 'text/plain; version=0.0.4' },
  })
}
```

**File to modify:** `src/lib/env.ts` — add `metricsToken: process.env.METRICS_TOKEN`.

### I1-T6 — Compose healthchecks

> **Sequencing note (§3, §2):** This edit to `docker-compose.yml` is made by I and is sequenced AFTER C. C builds the compose file and `.env.example` first; I appends the healthcheck to the `app` service once `/api/healthz` exists. Do not duplicate or conflict with C's compose edits.

**File:** `docker-compose.yml`

Add to the `app` service:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/healthz"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 60s
```

**Verification:** `docker compose --profile full up -d && docker inspect --format='{{.State.Health.Status}}' parchment-app` returns `healthy` within 2 minutes. `curl -f http://localhost:3000/api/healthz` → 200. `curl -f http://localhost:3000/api/readyz` → 200 or 503 (DB must be up). `curl http://localhost:3000/api/metrics` with `Authorization: Bearer $METRICS_TOKEN` → 200 with `parchment_up 1`.

---

## I2 — Per-user storage quota + admin usage dashboard

### I2-T1 — Failing tests: quota schema migration

> **Reconciliation note (§2):** I's migration is **0024** (centrally allocated). Do NOT use 0020 (that is Phase 0's `app_config` table). Hand-write the migration file with the correct number and add the corresponding journal entry against the integrated branch.

**File:** `src/db/migrations/0024_quota.sql` (new)

```sql
alter table users add column if not exists quota_mb integer not null default 0;
-- 0 = unlimited (checked in application logic)
```

**File:** `src/db/__tests__/quota-schema.test.ts` (new, integration)

```
- users table has quota_mb integer column defaulting to 0
- quota_mb can be set to positive integer via update
```

### I2-T2 — Update Drizzle schema

**File:** `src/db/schema.ts`

Add to `users` table:

```typescript
quotaMb: integer('quota_mb').notNull().default(0), // 0 = unlimited
```

Hand-write migration `0024_quota.sql` (do NOT run `pnpm db:generate` off a stale base — see §2 of reconciliation).

### I2-T3 — Failing tests: quota enforcement at asset upload

**File:** `src/app/api/docs/[id]/assets/__tests__/quota.test.ts` (new)

```
- When user.quota_mb === 0, upload is always allowed (unlimited)
- When user.quota_mb > 0 and used bytes + file bytes <= quota, upload proceeds
- When user.quota_mb > 0 and used bytes + file bytes > quota, returns 413 { error: 'quota_exceeded', usedMb, quotaMb }
- getUsedStorageBytes(userId) returns sum of all .assets/** file sizes under filesRoot for that user
- getUsedStorageBytes returns 0 when no assets directory exists
```

### I2-T4 — `src/lib/quota.ts` (storage measurement)

```typescript
// Recursively sum file sizes under ${filesRoot}/.assets/${docId}/
// for all docs owned by userId (requires a DB query for doc ids).
export async function getUsedAssetBytes(userId: string): Promise<number>
// Returns human-readable 'X.X MB'
export function formatBytes(bytes: number): string
```

### I2-T5 — Enforce quota at `POST /api/docs/[id]/assets/route.ts`

Before writing the file, after `bytes.byteLength > MAX_BYTES` check:

```typescript
const user = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
if (user.quotaMb > 0) {
  const usedBytes = await getUsedAssetBytes(user.id)
  if (usedBytes + bytes.byteLength > user.quotaMb * 1024 * 1024) {
    return NextResponse.json(
      { error: 'quota_exceeded', usedMb: usedBytes / 1024 / 1024, quotaMb: user.quotaMb },
      { status: 413 },
    )
  }
}
```

### I2-T6 — `src/lib/env.ts` — default quota env var

```typescript
defaultQuotaMb: Number(process.env.PARCHMENT_DEFAULT_QUOTA_MB ?? '0'),
```

Apply the default when creating users (in `setup/actions.ts` and any future user-create path):

```typescript
quotaMb: env.defaultQuotaMb,
role: 'editor', // §1i: canonical default role is 'editor'; 'member' is banned
```

### I2-T7 — Failing tests: admin usage dashboard data query

**File:** `src/lib/admin/usage.ts` (new)

```
export interface UsageSummary {
  userId: string; name: string; email: string; quotaMb: number
  docCount: number; contentSizeBytes: number; assetSizeBytes: number
}
export async function getWorkspaceUsage(): Promise<{
  users: UsageSummary[]
  dbSizeBytes: number
  totalAssetBytes: number
}>
```

Tests (unit, mock DB):
```
- Returns one UsageSummary per user
- docCount is correct count of non-trashed docs for that user
- contentSizeBytes is pg_column_size sum of documents.content for that user
- dbSizeBytes comes from pg_database_size('parchment')
- totalAssetBytes is sum of assetSizeBytes across all users
```

### I2-T8 — `src/app/(app)/settings/admin/usage/page.tsx` (new)

Admin-gated (`requireAdmin()`). Shows the table from `getWorkspaceUsage()`:

```
Columns: User | Email | Docs | Content | Assets | Quota
Row per user. Footer: DB size total, asset total.
```

### I2-T9 — Add "Usage" link to `/settings/admin/page.tsx`

Add a new `<li>` under the Observability section linking to `/settings/admin/usage`.

**Browser verification:** DOM probe: `document.querySelector('[href="/settings/admin/usage"]')` is non-null after admin login.

---

## I3 — Backup verification (dashboard surface only)

> **Reconciliation note (§1g):** The `backup-verify` scheduler job is registered and owned by **backup-sync** (on by default, no `BACKUP_VERIFY` env gate). I does NOT register the job, does NOT create `src/lib/backup/verify.ts`, and does NOT add `BACKUP_VERIFY` to env vars (it is banned — §4 env registry). I adds ONLY the admin dashboard surface that reads the job's live state from `scheduler.getState()`.

### I3-T1 — Surface backup-verify job on existing `/settings/admin/backup` page

The `BackupPage` server component already renders s3-backup job state. Add an analogous read-only block for the `backup-verify` job:
- Read the job entry from `scheduler.getState()` by name `'backup-verify'`.
- Show: status (idle / running / error), lastRun timestamp, nextRun timestamp, runCount.
- If the job is not in state (backup-sync not yet deployed), show a "not configured" placeholder.

No write operations — this page is purely informational for ops monitoring.

**Verification:** With backup-sync's job registered, `scheduler.getState()` includes `'backup-verify'`. The DOM on `/settings/admin/backup` has a `data-testid="backup-verify-status"` element showing the job's last run status.

---

## I4 — First-run setup wizard

> **Reconciliation note (§1f):** SMTP config is DB-only (B's design). I4 checks `isSmtpConfigured()` from `@/lib/email/send` (exported by B), which queries the `app_config` table. There are NO `SMTP_*` env vars in this plan — they are banned (§4 env registry). The "SMTP checklist" showing env-var set/unset status is removed.

### I4-T1 — Failing tests: setup wizard steps

**File:** `src/app/setup/__tests__/setup.test.ts` (new)

```
- /setup page renders "Welcome to Parchment" heading (existing — regression guard)
- After account creation, a confirmation step shows DB status = 'connected'
- SMTP section shows 'configured' when isSmtpConfigured() returns true
- SMTP section shows 'not configured' with a link to /settings/admin/smtp when isSmtpConfigured() returns false
- S3 checklist shows BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID,
  BACKUP_S3_SECRET_ACCESS_KEY and marks each as 'set' or 'not set' based on actual process.env
- S3 section shows 'configured' badge when all S3 vars are set
- /setup redirects to /login when owner already exists (existing behavior — regression)
```

### I4-T2 — `src/app/setup/actions.ts` — post-creation redirect to `/setup/config`

Change the final `redirect('/')` to `redirect('/setup/config')` so the wizard continues after account creation.

Also apply the default quota when creating the owner:

```typescript
quotaMb: env.defaultQuotaMb,
role: 'editor', // canonical role per reconciliation §1i
```

### I4-T3 — `src/app/setup/config/page.tsx` (new)

Server component (no auth check — just created the session). Shows:

1. **DB connected** — green pill (uses `probeDatabase()` inline).
2. **Email (SMTP)** — calls `isSmtpConfigured()` (imported from `@/lib/email/send`, B's module). Shows "Configured" (green) or "Not configured — [configure in admin settings]" (amber). No env-var table; no SMTP_* vars anywhere in this file.
3. **S3 off-site backup** — table of `BACKUP_S3_*` env vars with set/unset indicators (no secret values revealed — just "set" or "not set").
4. **Continue to workspace** button → `/`.

This page is bypass-able (navigating to `/` also works) — it's informational, not a gate.

### I4-T4 — Guard: bypass maintenance mode for `/setup` and `/setup/config`

In the middleware (I6-T3), exempt paths starting with `/setup` from the maintenance-mode block.

**Verification:** After `createOwner()`, the browser lands on `/setup/config`. DB pill shows "connected" (green). SMTP section reflects the DB-backed `isSmtpConfigured()` result. S3 section shows the correct set/unset states for the configured env vars. "Continue" → `/` lands on the file manager.

---

## I6 — Maintenance / read-only mode

### I6-T1 — Failing tests: maintenance flag storage + query

**File:** `src/lib/maintenance.ts` (new)

```
export async function isMaintenanceMode(): Promise<boolean>
export async function setMaintenanceMode(enabled: boolean, actorId: string): Promise<void>
```

Tests:
```
- isMaintenanceMode() returns false when no row in settings table for key='maintenance'
- isMaintenanceMode() returns true when settings row { ownerId: SYSTEM_OWNER_ID, key: 'maintenance', value: true } exists
- setMaintenanceMode(true, actorId) upserts the row and writes an audit log entry
- setMaintenanceMode(false, actorId) removes the row (or sets value: false) and writes audit log
```

**Schema note:** The `settings` table uses `(ownerId, key)` primary key. For system-wide flags, use a sentinel `ownerId` constant (e.g. `'00000000-0000-0000-0000-000000000000'`). This UUID must not collide with a real user. The `settings` table FK to `users` must be relaxed to `ON DELETE SET NULL` (already is in schema? — verify) or we use a well-known system user row.

**Alternative (simpler, preferred):** Store the flag as a file `/data/parchment/maintenance.lock` — `isMaintenanceMode()` checks `fs.existsSync`. This avoids the sentinel-UUID schema complication and works even when the DB is down (exactly when you need maintenance mode). **Use the file approach.**

Updated file-based tests:
```
- isMaintenanceMode() returns false when /data/parchment/maintenance.lock does not exist
- isMaintenanceMode() returns true when the lock file exists
- setMaintenanceMode(true) creates the file; setMaintenanceMode(false) removes it
- Both are safe to call concurrently (idempotent)
```

### I6-T2 — Failing tests: maintenance 503 on mutation routes

**File:** `src/lib/__tests__/maintenance-middleware.test.ts` (new)

```
- GET /api/docs returns 200 in maintenance mode (reads are allowed)
- POST /api/docs returns 503 { error: 'maintenance', message: '...' } in maintenance mode
- PUT /api/docs/[id] returns 503 in maintenance mode
- DELETE /api/docs/[id] returns 503 in maintenance mode
- GET /api/healthz returns 200 in maintenance mode (health checks never blocked)
- GET /api/readyz returns 200/503 (DB status) in maintenance mode
- /setup and /setup/config are NOT blocked in maintenance mode
```

### I6-T3 — `src/middleware.ts` — maintenance mode block + metrics

> **Security note (§1k):** `src/middleware.ts` handles maintenance-mode 503s and request-count metrics ONLY. It does NOT perform auth gating or route-level authorization — A's per-route `authorizeDocRoute` / `requireAdmin` calls remain the sole authz authority. This separation must be preserved; a security reviewer should verify that no auth logic creeps into middleware.

```typescript
// src/middleware.ts
import { isMaintenanceMode } from '@/lib/maintenance'
import { incrementCounter } from '@/lib/metrics'

export async function middleware(req: NextRequest) {
  // Maintenance mode: block all mutation API routes (non-GET, non-HEAD).
  // Reads (GET/HEAD) are always allowed. Health routes are always allowed.
  // NOTE: This middleware does NOT perform authentication or authorization.
  //       Per-route authz is A's responsibility (authorizeDocRoute / requireAdmin).
  const { pathname } = req.nextUrl
  const isHealth = pathname.startsWith('/api/healthz') || pathname.startsWith('/api/readyz')
  const isSetup = pathname.startsWith('/setup')
  const isMutation = !['GET', 'HEAD'].includes(req.method)
  const isApi = pathname.startsWith('/api/')

  if (!isHealth && !isSetup && isMutation && isApi && await isMaintenanceMode()) {
    return NextResponse.json(
      { error: 'maintenance', message: 'The server is in maintenance mode. Writes are disabled.' },
      { status: 503, headers: { 'Retry-After': '300' } },
    )
  }

  // Metrics: increment request counter for every matched route.
  incrementCounter('parchment_request_count')
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/setup/:path*'],
}
```

### I6-T4 — Admin toggle UI: `src/app/(app)/settings/admin/maintenance/page.tsx` (new)

Admin-gated. Shows:
- Current status: "Maintenance mode is ON / OFF" with a colored pill.
- Toggle button (Server Action): calls `setMaintenanceMode(!current, user.id)`.
- Warning copy: "While maintenance mode is enabled, all write operations are blocked. Reads remain available."

**File:** `src/app/(app)/settings/admin/maintenance/actions.ts` (new) — Server Action `toggleMaintenance`.

### I6-T5 — Maintenance banner in root layout

**File:** `src/app/(app)/layout.tsx` (or the root `src/app/layout.tsx`) — add a server-side banner:

```tsx
// At the top of the page, above the sidebar.
{await isMaintenanceMode() && (
  <div role="alert" data-testid="maintenance-banner" className="…bg-amber-500…">
    Maintenance mode is active. The workspace is read-only until an admin disables it.
  </div>
)}
```

**Browser verification:** When lock file exists, `document.querySelector('[data-testid="maintenance-banner"]')` is non-null. POST to `/api/docs` returns 503. GET to `/api/docs` returns 200.

### I6-T6 — Add "Maintenance" link to `/settings/admin/page.tsx`

---

## I8 — Container security scan in CI

### I8-T1 — Add Trivy scan job to `release.yml`

**File:** `.github/workflows/release.yml`

Add a `scan` job after `publish`:

```yaml
scan:
  needs: publish
  runs-on: ubuntu-latest
  permissions:
    contents: read
    security-events: write   # for uploading SARIF to GitHub Security tab
  steps:
    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        image-ref: ghcr.io/jonathanmcohen/parchment:${{ github.ref_name }}
        format: sarif
        output: trivy-results.sarif
        severity: HIGH,CRITICAL
        exit-code: '1'         # fail the job on HIGH/CRITICAL findings

    - name: Upload Trivy scan results to GitHub Security tab
      if: always()              # upload even if the scan fails
      uses: github/codeql-action/upload-sarif@v3
      with:
        sarif_file: trivy-results.sarif
```

**Verification:** The `scan` job appears in release workflow runs. A deliberate HIGH-severity finding in a test image causes CI to fail (not testable in unit tests — verify via CI run commentary in the PR).

**Note:** The `publish` job must complete (push) before `scan` can pull the image. The `needs: publish` dependency enforces this.

---

## I9 — Per-user data export (GDPR)

### I9-T1 — Failing tests: GDPR export route

**File:** `src/app/api/user/export/__tests__/gdpr-export.test.ts` (new)

```
- GET /api/user/export without auth returns 401
- GET /api/user/export with auth returns 200 with Content-Type: application/zip
- The zip contains export-manifest.json with { exportedAt, userId, version }
- The zip contains profile.json with { name, email, createdAt } — no passwordHash, no tokenHash
- The zip contains documents/{id}.json for every non-trashed doc owned by the user
- The zip does NOT contain any documents owned by other users
- The zip does NOT contain passwordHash, tokenHash, or any credential fields
```

### I9-T2 — `src/lib/export/gdpr.ts` (new)

```typescript
// Build a GDPR-compliant data export zip for one user.
// Re-uses the JSZip dependency already in the backup service.
//
// Zip layout:
//   export-manifest.json   { exportedAt, userId, appVersion }
//   profile.json           { name, email, createdAt, role }
//   documents/{docId}.json { id, title, folderId, content, markdown, createdAt, updatedAt }
//   (trashed docs are excluded — their trashedAt is set; they are fetchable via trash)
//
// Security:
//   - ownerId filter is applied on EVERY query — SQL WHERE ownerId = userId.
//   - No credential fields (passwordHash, tokenHash, totpSecret, recoveryCodes) are included.
//   - No other users' data is queried.
export async function buildGdprExport(userId: string): Promise<Uint8Array>
```

### I9-T3 — `src/app/api/user/export/route.ts` (new)

```typescript
// GET /api/user/export — GDPR data portability export.
// Auth: session or PAT (authenticateRequest). Any authenticated user can export their own data.
// Returns a .zip attachment.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const zipBytes = await buildGdprExport(user.id)
  const dateStamp = new Date().toISOString().slice(0, 10)
  const filename = `parchment-export-${dateStamp}.zip`

  return new Response(zipBytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
```

### I9-T4 — Surface in Settings

**File:** `src/app/(app)/settings/account/page.tsx`

Add a "Download your data" section:

```tsx
<section aria-labelledby="export-data">
  <h2 id="export-data">Your data</h2>
  <p>Download a copy of all your documents and profile information.</p>
  <a href="/api/user/export" download>Download data export</a>
</section>
```

**Browser verification:** Link is present in settings. Clicking downloads a `.zip`. Unzipping shows `profile.json` with the logged-in user's name/email and `documents/` directory with their docs. No other users' data present.

---

## I5 — Upgrade / migration tooling (reference)

**Dependency on Group C:** The core migration mechanism (migrate.sh, Drizzle migrations, all-in-one → external DB) is owned by `c-split-db.md`. This group adds only:

### I5-T1 — `/settings/admin/migrations` info page (new)

**File:** `src/app/(app)/settings/admin/migrations/page.tsx`

Server component (`requireAdmin()`). Queries:

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

And lists: (a) migration files from `src/db/migrations/*.sql` detected at build time via `fs.readdirSync`, (b) a note that all migrations are applied automatically on startup via `migrate.sh`.

No "run migration" button — migrations are applied automatically. This page is informational only.

---

## I4-supplement — S3 env validation

> **Reconciliation note (§1f):** SMTP is DB-only (no `SMTP_*` env vars exist — they are banned per §4). The setup wizard checks SMTP via `isSmtpConfigured()` (B's DB query), not env vars.

The setup wizard references S3 env vars only. Ensure they are accessible from a server component without any additional env.ts changes (they read directly from `process.env` in the server component). Do NOT add them to `env.ts` as required — they remain optional.

---

## Verification summary (complete, no placeholders)

| Item | Automated test | Browser / curl check |
|------|---------------|----------------------|
| I7 logger | I7-T1 unit tests (LOG_LEVEL, LOG_FORMAT) | `LOG_FORMAT=json node -e "require('./src/lib/log').makeLogger('x').info('hi')"` emits JSON |
| I1 /healthz | I1-T1 route unit tests | `curl -f http://localhost:3000/api/healthz` → `{"ok":true}` |
| I1 /readyz | I1-T1 | `curl http://localhost:3000/api/readyz` → 200 `{"ok":true,"checks":{"db":"up","collab":"up"}}` |
| I1 /metrics | I1-T1 | `curl -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/api/metrics` → `parchment_up 1` |
| I1 compose | (manual smoke — after C) | `docker inspect --format='{{.State.Health.Status}}' parchment-app` → `healthy` |
| I2 quota schema | I2-T1 integration (migration 0024) | `psql -c '\d users'` shows `quota_mb` column |
| I2 quota enforce | I2-T3 unit tests | POST /api/docs/[id]/assets with over-quota user → 413 `quota_exceeded` |
| I2 usage dashboard | I2-T7 unit tests | DOM: `[data-testid="usage-table"]` shows rows per user |
| I3 dashboard surface | (manual — requires backup-sync deployed) | DOM: `[data-testid="backup-verify-status"]` visible on backup page; reads job state from scheduler |
| I4 wizard config step | I4-T1 tests | Browser: after setup, lands on `/setup/config`, DB pill "connected", SMTP via isSmtpConfigured() |
| I4 SMTP check | I4-T1 (mock isSmtpConfigured) | SMTP section shows "configured"/"not configured" (no SMTP_* env vars referenced) |
| I6 maintenance block | I6-T2 tests | POST /api/docs with lock file → 503; GET /api/docs → 200; middleware has no auth logic |
| I6 banner | I6-T5 | DOM: `[data-testid="maintenance-banner"]` present when lock file exists |
| I6 admin toggle | (manual) | `/settings/admin/maintenance` → toggle creates/removes lock file |
| I8 CI scan | (CI run) | Release workflow: `scan` job appears; HIGH/CRITICAL → workflow fails |
| I9 GDPR zip | I9-T1 unit tests | Downloaded zip contains `profile.json` + `documents/*.json` for that user only |

---

## New files (create)

| File | Purpose |
|------|---------|
| `src/lib/log.ts` | Structured logger (I7) |
| `src/lib/metrics.ts` | Prometheus counter registry (I1) |
| `src/lib/maintenance.ts` | Lock-file-based maintenance flag (I6) |
| `src/lib/quota.ts` | Asset storage measurement (I2) |
| `src/lib/admin/usage.ts` | Workspace usage query (I2) |
| `src/lib/export/gdpr.ts` | GDPR export builder (I9) |
| `src/app/api/healthz/route.ts` | Liveness probe (I1) |
| `src/app/api/readyz/route.ts` | Readiness probe (I1) |
| `src/app/api/metrics/route.ts` | Prometheus scrape (I1) |
| `src/app/api/user/export/route.ts` | GDPR data export (I9) |
| `src/app/setup/config/page.tsx` | Post-setup config wizard (I4) |
| `src/app/(app)/settings/admin/usage/page.tsx` | Usage dashboard (I2) |
| `src/app/(app)/settings/admin/maintenance/page.tsx` | Maintenance toggle UI (I6) |
| `src/app/(app)/settings/admin/maintenance/actions.ts` | Toggle server action (I6) |
| `src/app/(app)/settings/admin/migrations/page.tsx` | Migration info page (I5) |
| `src/db/migrations/0024_quota.sql` | Add quota_mb column (I2) — migration #0024 per §2 |
| `src/middleware.ts` | Maintenance + metrics middleware (I1/I6) — no auth gating (§1k) |

**Not created by I (reconciliation):**
- `src/lib/telemetry.ts` — DROPPED (§1j: no network ping)
- `src/lib/backup/verify.ts` — DROPPED (§1g: owned by backup-sync)

## Modified files (extend)

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add `quotaMb` to `users` table (I2) |
| `src/lib/env.ts` | Add `logLevel`, `logFormat`, `defaultQuotaMb`, `metricsToken` (I7/I1/I2) — no `telemetry` (§1j banned) |
| `src/lib/schedules/scheduler.ts` | Call `incrementCounter` in execute() (I1) — do NOT register `backup-verify` here (§1g: backup-sync owns it) |
| `src/app/api/docs/[id]/assets/route.ts` | Quota check before write (I2) |
| `src/app/(app)/settings/admin/page.tsx` | Add links: Usage, Maintenance, Migrations (I2/I6/I5) |
| `src/app/(app)/settings/admin/backup/page.tsx` | Add backup-verify job status block (reads state; I3) |
| `src/app/(app)/settings/account/page.tsx` | Add "Download your data" export link (I9) |
| `src/app/(app)/layout.tsx` | Maintenance banner (I6) |
| `src/app/setup/actions.ts` | Redirect to `/setup/config` post-creation; set role=`editor` (I4, §1i) |
| `instrumentation.ts` | No `sendBootPing()` — telemetry ping dropped (§1j) |
| `.github/workflows/release.yml` | Add `scan` job with Trivy (I8) |
| `docker-compose.yml` | Add healthcheck to `app` service — sequenced AFTER C (I1, §3) |
| All `console.*` call-sites in `src/lib/` | Replace with structured logger (I7) |

---

## Open questions

1. **Sentinel UUID for maintenance lock file** — the file-based approach (`/data/parchment/maintenance.lock`) is recommended over a DB settings-row approach. Confirm the path is inside the existing `env.filesRoot` mount or a sibling directory that is always writable in the container. If `PARCHMENT_FILES_ROOT` is set to a custom path, the lock file should live at `${env.filesRoot}/../maintenance.lock` or a configurable `PARCHMENT_LOCK_DIR`.

2. **`/metrics` auth in production** — the `METRICS_TOKEN` env var is recommended so Prometheus can scrape without a user session. If the instance is on a private network and the user prefers no token, allow `METRICS_TOKEN=` (empty) to mean "open". Document this choice.

3. **GDPR export trashed docs** — the plan excludes trashed documents from the export (they are soft-deleted, still in DB). Confirm whether GDPR requires exporting trashed content too. If yes, remove the `WHERE trashedAt IS NULL` filter and add a `documents/trash/` subdirectory.

4. **I5 migration page: build-time vs runtime file listing** — `fs.readdirSync('src/db/migrations')` works in a standalone Next.js build only if the migrations directory is copied into the `.next/standalone` output. Verify the Dockerfile copies `src/db/migrations/` into the runner stage (it does — via `COPY --from=builder /app/.next/standalone ./`). If the path is wrong, serve the list from a static import of the file names at build time instead.

5. **I3 dashboard when backup-sync not yet deployed** — `scheduler.getState()` will not include `'backup-verify'` until backup-sync ships. The dashboard block should gracefully handle the missing key (show "Not yet configured" placeholder) rather than crashing or hiding the section entirely. Confirm this with backup-sync's implementer before I3-T1 is written.
