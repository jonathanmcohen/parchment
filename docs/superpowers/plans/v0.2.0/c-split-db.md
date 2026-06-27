# Group C — Separate database container
## v0.2.0 implementation plan

**Spec items:** C1 strip embedded Postgres, C2 docker-compose.yml, C3 migration path, C4 compose-snippet handoff to F (NOT a README rewrite — see §1h of reconciliation).

**Locked decisions:**
- `ghcr.io/jonathanmcohen/pgvector` is built in a separate repo; Parchment consumes it.
- Parchment continues to own `CREATE EXTENSION vector` via its own migration 0000.
- `DATABASE_URL` env var is the sole wiring point; `src/lib/env.ts` already has a safe fallback and no validation change is needed.
- The existing `migrate.sh` runs after Postgres is ready; in the new world it waits for the external DB instead of the bundled one.

---

## OPEN QUESTIONS (must confirm before C2 compose file is finalized)

1. **pgvector image interface** — the exact tag, env var names (`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`), exposed port (assumed 5432), and whether the image pre-installs the `vector` extension or leaves it to the first migration. **Assumption used throughout this plan:** standard `postgres` conventions (env `POSTGRES_USER/PASSWORD/DB`, port 5432) and the extension is NOT pre-created (Parchment's migration 0000 does `CREATE EXTENSION IF NOT EXISTS vector` which is idempotent). Confirm against `https://github.com/jonathanmcohen/pgvector` README before finalizing.
2. **Extension pre-created?** If the separate image already runs `CREATE EXTENSION vector` at init, migration 0000's `IF NOT EXISTS` guard is safe and no change is needed.
3. **Image tag convention** — does the pgvector image publish a `pg18` or `latest` tag, or is there a semver scheme to pin?

---

## Dependency map

```
C1 (Dockerfile strip) → C2 (compose) → C3 (migration docs) → C4 (compose snippet → F3)
                                      ↑
                              CI image-size check (C2 gate)
                              C5 (healthz stub, required by compose healthcheck)
```

**Note (reconciliation §5 "C"):** C does NOT rewrite `README.md`. C4 produces a
compose-quickstart SNIPPET that F's README task (F3) incorporates. F3 is the sole
`README.md` author for v0.2.0.

**Note (reconciliation §7k):** C owns `/api/healthz` (liveness, `{"status":"ok"}`) and its unit test `tests/unit/healthz.test.ts`. **C ships this stub so the compose healthcheck works immediately.** Group I adds a SEPARATE `/api/readyz` endpoint (DB ping, build hash, memory) in its own tasks — I does NOT rewrite `/api/healthz` and does NOT add tests for it. Zero test collision. See Task C5.

---

## Task C1 — Strip embedded Postgres from the Dockerfile

**Goal:** Remove the Postgres **server** (`postgresql-18 postgresql-18-pgvector` packages), the s6 `postgres` service, the `PGDATA` env, the `/var/lib/postgresql` volume, and the `postgres` user setup. **Keep** `postgresql-client-18` (needed by `migrate.sh` for `pg_isready`/`createdb`/`psql`) — the PGDG apt repo therefore stays. The image becomes ~250 MB smaller. `DATABASE_URL` must still be configurable (it is — `src/lib/env.ts` reads it with a fallback).

> **Reconciliation §7p:** The PGDG apt repo is KEPT (it provides `postgresql-client-18`). What is REMOVED is the Postgres *server* package (`postgresql-18`) and its pgvector extension package (`postgresql-18-pgvector`), plus the s6 `postgres` service. `postgresql-client-18` is the only Postgres package that remains in the image.

### C1-T1 — Failing test: image-size regression guard

Write a CI step (in `ci.yml`) that fails if the app image is **larger than 900 MB** compressed. This is currently the baseline; post-strip the target is under 600 MB. The test fails today because no such check exists and the Postgres-bloated image would exceed 600 MB.

**File:** `.github/workflows/ci.yml`

Add a new `image-size` job (runs after `build`):

```yaml
image-size:
  runs-on: ubuntu-latest
  needs: [build]
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 24
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - name: Build app image
      run: docker build -t parchment-size-check .
    - name: Check image size (must be under 600 MB)
      run: |
        SIZE=$(docker image inspect parchment-size-check \
          --format '{{.Size}}')
        MAX=$((600 * 1024 * 1024))
        echo "Image size: $SIZE bytes (max $MAX)"
        [ "$SIZE" -lt "$MAX" ] || { echo "Image too large!"; exit 1; }
```

**Run:** `pnpm lint && pnpm typecheck` (the YAML is not linted by Biome, but CI will pick it up). At this point the check fails because the image has Postgres.

### C1-T2 — Implement: strip Postgres from Dockerfile

Edit `Dockerfile`.

**Remove from the runner stage:**

1. The `PGDATA` env var line:
   ```
   PGDATA=/var/lib/postgresql/data \
   ```
2. From the apt-get install block: remove `postgresql-18 postgresql-18-pgvector` (server + server-side extension). **DO NOT remove** the PGDG key/repo lines or `gnupg` — they are still needed to install `postgresql-client-18`. Keep `ca-certificates curl gnupg xz-utils` and the PGDG repo setup unchanged.
3. The `ENV PATH="/usr/lib/postgresql/18/bin:${PATH}"` line — this can stay or be removed; `postgresql-client-18` installs its binaries to the same path so the line is a no-op either way. **Do not remove** if keeping it avoids a diff conflict; it is harmless.
4. The s6 `postgres` service files from the chmod list:
   ```
   /etc/s6-overlay/s6-rc.d/postgres/run \
   ```
5. The `install -d -o postgres -g postgres /var/lib/postgresql` part of the RUN command.
6. The `VOLUME ["/var/lib/postgresql", "/data"]` line — replace with `VOLUME ["/data"]` (the markdown files volume remains).

**Remove `rootfs/etc/s6-overlay/s6-rc.d/postgres/` entirely** (all 3 files: `run`, `type`, `dependencies.d/base`). Also remove `rootfs/etc/s6-overlay/s6-rc.d/user/contents.d/postgres` (the user bundle entry).

**Update `rootfs/etc/s6-overlay/s6-rc.d/migrate/dependencies.d/`:** The `postgres` dependency file currently makes `migrate` wait for the s6 `postgres` service. Since there is no longer an s6 postgres service, **remove** `rootfs/etc/s6-overlay/s6-rc.d/migrate/dependencies.d/postgres`. The `migrate.sh` script already polls `pg_isready` in a loop — that becomes the sole readiness gate against the external DB.

**Update `rootfs/etc/parchment/migrate.sh`:** Change EVERY Postgres client invocation to use variables parsed from `DATABASE_URL` — `pg_isready`, `createdb`, the schema-presence `psql` check, and the migration apply loop. **Never hardcode `-U parchment -d parchment`.** (Reconciliation §7o.)

The cleanest approach is to parse all connection parameters up front:

```sh
#!/command/with-contenv sh
set -e

# Parse ALL connection params from DATABASE_URL.
# Expected format: postgres://user:pass@host:port/db  (or postgresql://...)
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+)[:/].*|\1|')
DB_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|' | grep -E '^[0-9]+$' || echo "5432")
# DB_NAME: parsed from URL path; fall back to $POSTGRES_DB (never hardcode 'parchment').
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+)(\?.*)?$|\1|')
DB_NAME="${DB_NAME:-${POSTGRES_DB:-parchment}}"

# ── 1. Wait for Postgres ───────────────────────────────────────────────────────
echo "[parchment] waiting for postgres at $DB_HOST:$DB_PORT as $DB_USER ..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do sleep 2; done
echo "[parchment] postgres ready"

# ── 2. Ensure DB exists ────────────────────────────────────────────────────────
# createdb is a no-op if the DB was already created by the pgvector image
# (POSTGRES_DB). Keep the || true guard.
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" 2>/dev/null || true

# ── 3. Schema-presence check (psql) ───────────────────────────────────────────
# Check if the migrations table exists to decide whether to run or skip.
# Use $DB_USER and $DB_NAME — never hardcode.
MIGRATED=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT to_regclass('public.migrations');" 2>/dev/null || echo "")

if [ "$MIGRATED" = "public.migrations" ]; then
  echo "[parchment] migrations table present; checking for pending migrations ..."
else
  echo "[parchment] fresh database; running all migrations ..."
fi

# ── 4. Apply pending migrations ────────────────────────────────────────────────
# Iterate over /etc/parchment/migrations/*.sql in order.
# Each psql call uses $DB_USER/$DB_NAME — never hardcoded.
for SQL_FILE in $(ls /etc/parchment/migrations/*.sql 2>/dev/null | sort); do
  MIGRATION_NAME=$(basename "$SQL_FILE" .sql)
  ALREADY_RAN=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT name FROM migrations WHERE name='$MIGRATION_NAME';" 2>/dev/null || echo "")
  if [ -z "$ALREADY_RAN" ]; then
    echo "[parchment] applying migration: $MIGRATION_NAME"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SQL_FILE"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
      "INSERT INTO migrations (name, applied_at) VALUES ('$MIGRATION_NAME', now());" 2>/dev/null || true
  fi
done

echo "[parchment] migrations complete"
```

> **§7o compliance checklist — every `psql`/`pg_isready`/`createdb` invocation in `migrate.sh` must use `-U "$DB_USER"` and (where applicable) `-d "$DB_NAME"`. No call may use `-U parchment` or `-d parchment` as a literal string.**

**Problem:** `pg_isready`, `createdb`, and `psql` are no longer in the app image after stripping postgresql-18. Install only the `postgresql-client-18` package (no server) — this provides the client binaries and is ~30 MB versus ~200 MB for the server. Add it to the apt-get install line:

```dockerfile
apt-get install -y --no-install-recommends postgresql-client-18
```

The PGDG repo lines must stay to install `postgresql-client-18` from PGDG (Bookworm ships an older pg client). But `gnupg` is still needed for the apt key — keep it, and keep the purge. The size reduction still wins.

Also add `postgresql-client-18` to the `PATH` line:
```dockerfile
ENV PATH="/usr/lib/postgresql/18/bin:${PATH}"
```
This line can remain unchanged since `postgresql-client-18` installs binaries to the same path.

**Verification (C1-T2):**
```bash
docker build -t parchment:c1-test .
docker image inspect parchment:c1-test --format '{{.Size}}'
# Must be < 600 MB (629145600 bytes)
# Confirm no postgres server binary:
docker run --rm parchment:c1-test which postgres 2>&1 | grep -v "^/"
# Must print nothing or "which: no postgres in ..."
# Confirm client tools are present:
docker run --rm parchment:c1-test which psql
# Must print /usr/lib/postgresql/18/bin/psql
```

**Commit:** `git commit -m "C1: strip embedded Postgres server from image; install pg-client-18 only"`

---

## Task C2 — Production docker-compose.yml

**Goal:** Ship a `docker-compose.yml` at repo root for **production** use — two services: `db` (ghcr.io/jonathanmcohen/pgvector) + `app` (ghcr.io/jonathanmcohen/parchment). The existing `docker-compose.yml` is currently marked "DEV ONLY"; it must be rewritten or replaced.

### C2-T1 — Failing test: compose file lint / smoke test

Write a unit test that validates the compose file's structure (service names, required env keys, healthcheck presence):

**File:** `tests/unit/compose.test.ts`

```typescript
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, it, expect } from 'vitest'

describe('docker-compose.yml structure', () => {
  const raw = readFileSync('docker-compose.yml', 'utf8')
  const compose = parse(raw)

  it('has a db service', () => {
    expect(compose.services).toHaveProperty('db')
  })
  it('db service has a healthcheck', () => {
    expect(compose.services.db.healthcheck).toBeDefined()
  })
  it('db service uses the pgvector image', () => {
    expect(compose.services.db.image).toMatch(/pgvector/)
  })
  it('has an app service', () => {
    expect(compose.services).toHaveProperty('app')
  })
  it('app service DATABASE_URL references db host', () => {
    const envBlock = compose.services.app.environment as Record<string, string>
    const url = envBlock.DATABASE_URL ?? ''
    expect(url).toMatch(/db/)
  })
  it('has a named volume for postgres data', () => {
    expect(compose.volumes).toBeDefined()
    const volNames = Object.keys(compose.volumes)
    expect(volNames.some(v => v.includes('pg'))).toBe(true)
  })
  it('db service mounts the postgres volume', () => {
    const vols: string[] = compose.services.db.volumes ?? []
    expect(vols.some((v: string) => v.includes('/var/lib/postgresql'))).toBe(true)
  })

  // ── §4 env-var registry coverage ─────────────────────────────────────────
  // Every variable listed in the reconciliation §4 must appear in the compose
  // environment block (required ones active, optional ones at least commented).
  // This test reads the RAW text to catch commented-out entries too.
  const REQUIRED_VARS = [
    'PARCHMENT_SECRET_KEY',
    'PARCHMENT_PUBLIC_URL',
    'DATABASE_URL',
    'PARCHMENT_VERSION',
    'PORT',
    'SECURE_COOKIES',
    'COLLAB_URL',
    'COLLAB_PORT',
    'PARCHMENT_FILES_ROOT',
    'LOG_LEVEL',
    'LOG_FORMAT',
    'METRICS_TOKEN',
    'PARCHMENT_DEFAULT_QUOTA_MB',
    'PARCHMENT_LOCK_DIR',
    'BACKUP_S3_ENDPOINT',
    'BACKUP_S3_BUCKET',
    'BACKUP_S3_ACCESS_KEY_ID',
    'BACKUP_S3_SECRET_ACCESS_KEY',
    'EMBEDDINGS_URL',
    'EMBEDDINGS_API_KEY',
    'EMBEDDINGS_MODEL',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
  ]
  for (const v of REQUIRED_VARS) {
    it(`compose.yml documents env var ${v}`, () => {
      expect(raw).toContain(v)
    })
  }
})
```

Add `yaml` to dev dependencies if not present: `pnpm add -D yaml`. Run `pnpm exec vitest run tests/unit/compose.test.ts` — this fails today because compose.yml is "DEV ONLY" with no `app` service using an external `db` and the full §4 env-var registry is not present.

### C2-T2 — Implement: rewrite docker-compose.yml

Rewrite the existing `docker-compose.yml`. The environment block MUST document every
variable from the §4 env-var registry (reconciliation doc) — this is the canonical
reference callers consult before writing their own `.env`. Variables that are optional
or owned by later groups are listed but commented out so the file is complete:

```yaml
# docker-compose.yml — Production deployment (v0.2.0+).
# Two services: external pgvector DB + the Parchment app.
# For local development (source mount, live reload) see docker-compose.dev.yml.
#
# OPEN QUESTION: confirm ghcr.io/jonathanmcohen/pgvector image tag + env interface
# before finalizing. Assumed: standard postgres conventions (POSTGRES_USER/PASSWORD/DB),
# port 5432. If the image pre-creates the vector extension, Parchment migration 0000
# IF NOT EXISTS guard is still safe.

services:
  db:
    image: ghcr.io/jonathanmcohen/pgvector:latest   # TODO: pin a digest/tag once confirmed
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-parchment}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
      POSTGRES_DB: ${POSTGRES_DB:-parchment}
    volumes:
      - parchment_pg:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-parchment}']
      interval: 5s
      timeout: 3s
      retries: 20
      start_period: 10s
    networks:
      - parchment_net

  app:
    image: ghcr.io/jonathanmcohen/parchment:${PARCHMENT_VERSION:-latest}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    # healthcheck targets /api/healthz — a minimal stub shipped by C (Task C5).
    # Group I later enhances this endpoint with DB-ready/memory/build checks.
    healthcheck:
      test: ['CMD-SHELL', 'curl -sf http://localhost:3000/api/healthz || exit 1']
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 30s
    environment:
      # ── Core (required) ────────────────────────────────────────────────────
      DATABASE_URL: postgres://${POSTGRES_USER:-parchment}:${POSTGRES_PASSWORD:?}@db:5432/${POSTGRES_DB:-parchment}
      PARCHMENT_VERSION: ${PARCHMENT_VERSION:-latest}
      PORT: ${PORT:-3000}
      SECURE_COOKIES: ${SECURE_COOKIES:-false}

      # External base URL — REQUIRED. Used for invite-accept links and OIDC redirect_uri.
      # Phase 0 boot fails if absent. Example: https://parchment.example.com
      PARCHMENT_PUBLIC_URL: ${PARCHMENT_PUBLIC_URL:?PARCHMENT_PUBLIC_URL is required — set to your external base URL (e.g. https://parchment.example.com)}

      # ── Secret key (REQUIRED for all encrypted instance config) ────────────
      # Generate: openssl rand -base64 32
      PARCHMENT_SECRET_KEY: ${PARCHMENT_SECRET_KEY:?PARCHMENT_SECRET_KEY is required — see .env.example}

      # ── Collaboration (Hocuspocus) ─────────────────────────────────────────
      COLLAB_URL: ${COLLAB_URL:-ws://localhost:1234}
      COLLAB_PORT: ${COLLAB_PORT:-1234}

      # ── File storage ───────────────────────────────────────────────────────
      PARCHMENT_FILES_ROOT: /data/files

      # ── Logging (optional; defaults: LOG_LEVEL=info, LOG_FORMAT=json) ──────
      # LOG_LEVEL: ${LOG_LEVEL:-info}          # trace|debug|info|warn|error
      # LOG_FORMAT: ${LOG_FORMAT:-json}        # json|pretty

      # ── Metrics (optional; omit to disable /metrics endpoint) ─────────────
      # METRICS_TOKEN: ${METRICS_TOKEN}

      # ── Quota (optional; default 512 MB per user) ──────────────────────────
      # PARCHMENT_DEFAULT_QUOTA_MB: ${PARCHMENT_DEFAULT_QUOTA_MB:-512}

      # ── File locking (optional; default /tmp/parchment-locks) ─────────────
      # PARCHMENT_LOCK_DIR: ${PARCHMENT_LOCK_DIR:-/tmp/parchment-locks}

      # ── S3 backup (optional; omit to disable cloud backup) ────────────────
      # BACKUP_S3_ENDPOINT: ${BACKUP_S3_ENDPOINT}
      # BACKUP_S3_BUCKET: ${BACKUP_S3_BUCKET}
      # BACKUP_S3_ACCESS_KEY_ID: ${BACKUP_S3_ACCESS_KEY_ID}
      # BACKUP_S3_SECRET_ACCESS_KEY: ${BACKUP_S3_SECRET_ACCESS_KEY}

      # ── Semantic search / embeddings (optional) ────────────────────────────
      # EMBEDDINGS_URL: ${EMBEDDINGS_URL}
      # EMBEDDINGS_API_KEY: ${EMBEDDINGS_API_KEY}
      # EMBEDDINGS_MODEL: ${EMBEDDINGS_MODEL}

      # ── Passkeys / WebAuthn (required only in production behind TLS) ────────
      # PARCHMENT_RP_ID: your-domain.com
      # PARCHMENT_RP_ORIGIN: https://your-domain.com

      # ── BANNED (must NOT appear) ───────────────────────────────────────────
      # APP_SECRET        — replaced by PARCHMENT_SECRET_KEY
      # SMTP_*            — SMTP configured via admin UI, not env
      # PARCHMENT_TELEMETRY (network ping) — dropped for v0.2.0
      # BACKUP_VERIFY     — job is on-by-default in backup-sync; no env gate
    ports:
      - '${PORT:-3000}:3000'
      - '${COLLAB_PORT:-1234}:1234'
    volumes:
      - parchment_data:/data
    networks:
      - parchment_net

volumes:
  parchment_pg:
  parchment_data:

networks:
  parchment_net:
    driver: bridge
```

Move the existing dev compose content to `docker-compose.dev.yml`:

```yaml
# docker-compose.dev.yml — Development only.
# Live source mount + standalone dev Postgres on host port 5433.
# Usage: docker compose -f docker-compose.dev.yml up

services:
  db:
    image: pgvector/pgvector:pg18
    environment:
      POSTGRES_USER: parchment
      POSTGRES_PASSWORD: parchment
      POSTGRES_DB: parchment
    ports:
      - '5433:5432'
    volumes:
      - parchment_dev_pg:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U parchment']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  parchment_dev_pg:
```

### C2-T3 — Create `.env.example` with full §4 registry

Create `.env.example` at repo root. This is the canonical human-readable reference for
every env var listed in reconciliation §4. It MUST include every var the compose file
references (so the unit test in C2-T1 also checks `.env.example` contains them all).

```dotenv
# .env.example — Parchment v0.2.0+ environment variable reference.
# Copy to .env and fill in required values. Never commit .env.
# Full registry: reconciliation §4 (docs/superpowers/plans/v0.2.0/00-RECONCILIATION.md)

# ── Database (Postgres / pgvector) ─────────────────────────────────────────────
POSTGRES_USER=parchment
POSTGRES_PASSWORD=             # REQUIRED — choose a strong password
POSTGRES_DB=parchment

# ── App ─────────────────────────────────────────────────────────────────────────
DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
PARCHMENT_VERSION=v0.2.0
PORT=3000
SECURE_COOKIES=false           # set to 'true' in production behind TLS

# External base URL — REQUIRED. Boot fails if absent.
# Used for invite-accept links and OIDC redirect_uri.
PARCHMENT_PUBLIC_URL=          # REQUIRED — e.g. https://parchment.example.com

# ── Secret key (REQUIRED for all encrypted instance config) ─────────────────────
# Generate: openssl rand -base64 32
PARCHMENT_SECRET_KEY=          # REQUIRED

# ── Collaboration (Hocuspocus) ───────────────────────────────────────────────────
COLLAB_URL=ws://localhost:1234
COLLAB_PORT=1234

# ── File storage ─────────────────────────────────────────────────────────────────
PARCHMENT_FILES_ROOT=/data/files

# ── Logging ──────────────────────────────────────────────────────────────────────
LOG_LEVEL=info                 # trace|debug|info|warn|error
LOG_FORMAT=json                # json|pretty

# ── Metrics ──────────────────────────────────────────────────────────────────────
# METRICS_TOKEN=               # gates /metrics; omit to disable

# ── Quota ────────────────────────────────────────────────────────────────────────
# PARCHMENT_DEFAULT_QUOTA_MB=512

# ── File locking ─────────────────────────────────────────────────────────────────
# PARCHMENT_LOCK_DIR=/tmp/parchment-locks

# ── S3 backup (optional; omit to disable cloud backup) ───────────────────────────
# BACKUP_S3_ENDPOINT=
# BACKUP_S3_BUCKET=
# BACKUP_S3_ACCESS_KEY_ID=
# BACKUP_S3_SECRET_ACCESS_KEY=

# ── Semantic search / embeddings (optional) ───────────────────────────────────────
# EMBEDDINGS_URL=
# EMBEDDINGS_API_KEY=
# EMBEDDINGS_MODEL=

# ── Passkeys / WebAuthn (required only in production behind TLS) ──────────────────
# PARCHMENT_RP_ID=your-domain.com
# PARCHMENT_RP_ORIGIN=https://your-domain.com

# ── BANNED — do NOT add these ────────────────────────────────────────────────────
# APP_SECRET        → replaced by PARCHMENT_SECRET_KEY
# SMTP_*            → SMTP configured via admin UI, not env
# PARCHMENT_TELEMETRY (network ping) → dropped for v0.2.0
# BACKUP_VERIFY     → job is on-by-default; no env gate
```

Add `.env.example` coverage to the compose unit test — extend the `REQUIRED_VARS` loop
in `tests/unit/compose.test.ts` to also read `.env.example` and assert every var is
present there:

```typescript
// Append inside describe('docker-compose.yml structure', ...) in compose.test.ts:
import { readFileSync as readFile } from 'node:fs'

const envExample = readFile('.env.example', 'utf8')
for (const v of REQUIRED_VARS) {
  it(`.env.example documents env var ${v}`, () => {
    expect(envExample).toContain(v)
  })
}
```

**Run test:** `pnpm exec vitest run tests/unit/compose.test.ts` — must pass.

**Smoke test (manual, required before commit):**
```bash
export POSTGRES_PASSWORD=parchment_test_pw
docker compose pull
docker compose up -d
# Wait ~15 seconds for startup
docker compose ps
# Both services must show "healthy"/"running"
curl -sf http://localhost:3000/api/healthz | grep '"status":"ok"'
# Must return {"status":"ok"} (minimal stub from C5; enhanced by I)
# Check pgvector extension is present:
docker compose exec db psql -U parchment -d parchment \
  -c "SELECT extname FROM pg_extension WHERE extname='vector';"
# Must show:  extname
#            --------
#             vector
docker compose down -v
```

**Commit:** `git commit -m "C2: production docker-compose.yml + .env.example (full §4 registry); dev compose to docker-compose.dev.yml"`

---

## Task C3 — Migration path for all-in-one users

**Goal:** Provide a concrete, verified migration procedure for users who are running the v0.1.x all-in-one image and want to move to the v0.2.0 compose setup. Two paths:

- **Path A (volume migrate):** Reuse the existing `/var/lib/postgresql` Docker volume directly by mounting it into the new pgvector container.
- **Path B (pg_dump/restore):** Dump from the running v0.1.x container and restore into the new DB container.

### C3-T1 — Write migration script `scripts/migrate-aio-to-compose.sh`

This shell script automates Path B (dump + restore) and is the recommended path (more robust than volume reuse across Postgres major versions if the pgvector image uses a different PG version than 18).

```bash
#!/usr/bin/env bash
# migrate-aio-to-compose.sh
# Migrates a Parchment all-in-one (v0.1.x) instance to the v0.2.0 compose setup.
# Usage: ./scripts/migrate-aio-to-compose.sh <aio-container-name> [compose-project-dir]
#
# Steps:
#   1. Stop the all-in-one container (preserve volumes).
#   2. pg_dump the bundled Postgres into a local file.
#   3. Start only the db service from docker-compose.yml.
#   4. pg_restore into the new DB container.
#   5. Start the app service.
#
# Requires: docker, pg_dump/psql on the host (or uses the container's client).

set -euo pipefail

AIO_CONTAINER="${1:-parchment}"
COMPOSE_DIR="${2:-.}"
DUMP_FILE="/tmp/parchment_migration_$(date +%Y%m%d_%H%M%S).dump"

echo "==> Step 1: Stop all-in-one container '${AIO_CONTAINER}'"
docker stop "${AIO_CONTAINER}"

echo "==> Step 2: Dump database from all-in-one container"
# Parse the DB name from DATABASE_URL so we never hardcode 'parchment'.
# Falls back to $POSTGRES_DB then 'parchment' for v0.1.x containers where
# DATABASE_URL may not be set.
_DB_NAME=$(docker exec "${AIO_CONTAINER}" sh -c \
  'echo "${DATABASE_URL:-}" | sed -E "s|.*/([^?]+)(\?.*)?$|\1|"' 2>/dev/null || true)
_DB_NAME="${_DB_NAME:-${POSTGRES_DB:-parchment}}"
echo "    Using DB name: ${_DB_NAME}"
docker exec "${AIO_CONTAINER}" \
  pg_dump -h localhost -U "${POSTGRES_USER:-parchment}" -d "${_DB_NAME}" -F c \
  > "${DUMP_FILE}"
echo "    Dump written to ${DUMP_FILE}"

echo "==> Step 3: Start new db service"
cd "${COMPOSE_DIR}"
docker compose up -d db
echo "    Waiting for db to become healthy..."
until docker compose ps db | grep -q "healthy"; do sleep 2; done
echo "    DB healthy."

echo "==> Step 4: Restore dump into new DB"
# Use $POSTGRES_DB (from .env / env) — never hardcode 'parchment'.
# Use the db container's pg_restore to avoid client version mismatch.
docker compose exec -T db \
  pg_restore -h localhost -U "${POSTGRES_USER:-parchment}" \
  -d "${POSTGRES_DB:-parchment}" \
  --no-owner --no-privileges -F c < "${DUMP_FILE}"
echo "    Restore complete."

echo "==> Step 5: Start app service"
docker compose up -d app
echo ""
echo "Migration complete! Open http://localhost:3000 to verify."
echo "Old container '${AIO_CONTAINER}' is stopped; its volumes are intact."
echo "Once verified, remove it with: docker rm ${AIO_CONTAINER}"
echo "  and optionally remove pg volume: docker volume rm parchment_pg"
```

Make executable: `chmod +x scripts/migrate-aio-to-compose.sh`

**Verification of the script (manual, required):**

```bash
# Simulate an all-in-one v0.1.x instance:
docker run -d --name parchment_aio \
  -v parchment_pg_test:/var/lib/postgresql \
  -v parchment_data_test:/data \
  -p 3001:3000 \
  ghcr.io/jonathanmcohen/parchment:v0.1.9

# Wait for first-run setup, create at least one document via /setup.
# Then run the migration:
export POSTGRES_PASSWORD=parchment_test_pw
./scripts/migrate-aio-to-compose.sh parchment_aio .

# Verify:
curl -sf http://localhost:3000/api/healthz | grep '"status":"ok"'
# Log in; confirm documents from the old instance are present.
# Clean up:
docker rm parchment_aio
docker volume rm parchment_pg_test parchment_data_test
docker compose down -v
```

**Path A (volume reuse) documented in the snippet C produces for F — not scripted** because it requires identical Postgres major versions and is risky if not.

**Commit:** `git commit -m "C3: all-in-one to compose migration script (pg_dump/restore path)"`

---

## Task C4 — Compose quickstart SNIPPET (handoff to F3)

> **Reconciliation §1h:** C does NOT rewrite `README.md`. C4 produces a
> compose-quickstart SNIPPET (a Markdown excerpt) that F's README task (F3) incorporates.
> F3 is the sole `README.md` author for v0.2.0. C4 owns the CONTENT; F3 owns the FILE.

**Goal:** Write the compose quickstart content that documents compose-first deployment,
both quickstart options, the migration section, and the volume-reuse note — as a
standalone Markdown snippet that F3 pastes into README. Deliver it as
`docs/readme-snippets/compose-quickstart.md` (a working file, NOT the README).

### C4-T1 — Write `docs/readme-snippets/compose-quickstart.md`

Create the file. It must include:

1. **Compose quickstart block** — `docker compose up -d`, `.env` with
   `POSTGRES_PASSWORD` + `PARCHMENT_VERSION` + `PARCHMENT_SECRET_KEY`, link to
   `ghcr.io/jonathanmcohen/pgvector`.
2. **Legacy single-container note** — v0.1.x `docker run` is not supported in v0.2.0+.
3. **Migration section heading** (`## Migrating from all-in-one`) — references
   `scripts/migrate-aio-to-compose.sh` for dump/restore path; notes volume-reuse is
   advanced/risky across PG major versions.
4. **Dev compose note** — `docker compose -f docker-compose.dev.yml up -d db` for
   local dev Postgres on port 5433.

The full env-var table from §4 must be referenced (`.env.example` for full list).

**File:** `docs/readme-snippets/compose-quickstart.md`

```markdown
<!-- compose-quickstart.md — Snippet for F3 to paste into README.md.
     Owner: Group C. Consumed by: Group F (F3). Do not edit README directly. -->

## Quick start (Docker Compose — recommended)

> v0.2.0+ ships as two containers: the Parchment app and a separate
> [`ghcr.io/jonathanmcohen/pgvector`](https://github.com/jonathanmcohen/pgvector)
> database (Postgres 18 + pgvector). The `vector` extension is created automatically
> on first migration.

Create a `.env` file — **never commit it**:

```env
# Required
POSTGRES_PASSWORD=your_strong_password_here
PARCHMENT_SECRET_KEY=<base64-encoded 32 bytes — run: openssl rand -base64 32>
PARCHMENT_VERSION=v0.2.0

# Optional (uncomment to customise)
# POSTGRES_USER=parchment
# POSTGRES_DB=parchment
# PORT=3000
# COLLAB_PORT=1234
# SECURE_COOKIES=true          # set to true behind TLS
# LOG_LEVEL=info               # trace|debug|info|warn|error
# LOG_FORMAT=json              # json|pretty
# METRICS_TOKEN=               # gates /metrics; omit to disable
# PARCHMENT_DEFAULT_QUOTA_MB=512
# BACKUP_S3_ENDPOINT=          # optional cloud backup
# BACKUP_S3_BUCKET=
# BACKUP_S3_ACCESS_KEY_ID=
# BACKUP_S3_SECRET_ACCESS_KEY=
# EMBEDDINGS_URL=              # optional semantic search
# EMBEDDINGS_API_KEY=
# EMBEDDINGS_MODEL=
```

> See `.env.example` in the repo for the full env-var reference.

Then start both services:

```bash
curl -o docker-compose.yml \
  https://raw.githubusercontent.com/jonathanmcohen/parchment/main/docker-compose.yml
docker compose up -d
```

Open `http://localhost:3000` and complete first-run setup at `/setup`.

The two volumes that hold all persistent state:
- `parchment_pg` — Postgres data
- `parchment_data` — disk-mirrored Markdown files

---

## Quick start (single docker run — legacy, v0.1.x only)

Before v0.2.0, Parchment shipped as an all-in-one image with bundled Postgres:

```bash
docker run -d --name parchment \
  -p 3000:3000 -p 1234:1234 \
  -v parchment_pg:/var/lib/postgresql \
  -v parchment_data:/data \
  ghcr.io/jonathanmcohen/parchment:v0.1.9
```

This mode is **not supported in v0.2.0+**. See the migration section below.

---

## Migrating from all-in-one (v0.1.x) to Compose (v0.2.0)

Use the automated dump/restore script:

```bash
export POSTGRES_PASSWORD=your_strong_password_here
./scripts/migrate-aio-to-compose.sh <aio-container-name> .
```

Steps the script performs:
1. Stops the v0.1.x container (volumes are preserved).
2. `pg_dump` the bundled Postgres to a local file.
3. `docker compose up -d db` — starts the new pgvector DB.
4. `pg_restore` the dump into the new DB.
5. `docker compose up -d app`.

**Volume-reuse path (advanced):** Mounting the existing `parchment_pg` volume directly
into the new `db` service is only safe if both the old and new images use Postgres 18
with identical cluster encoding. The dump/restore path above is recommended for
reliability.

---

## Development

Start a local dev Postgres (host port 5433) used by `pnpm dev` / `pnpm collab`:

```bash
docker compose -f docker-compose.dev.yml up -d db
```
```

### C4-T2 — Notify F3 (handoff note in plan)

Leave a comment at the top of the snippet file and in the C4 commit message that
makes the dependency explicit. F3 must include the full content of
`docs/readme-snippets/compose-quickstart.md` in the README it produces.

**Commit:** `git commit -m "C4: compose quickstart snippet for F3 to incorporate into README"`

---

## Task C5 — Minimal /api/healthz stub

> **Reconciliation §7k:** `/api/healthz` is **C's endpoint**. C owns both the route file and its unit test. Group I does NOT rewrite `/api/healthz` — I adds a **separate** `/api/readyz` endpoint for deep readiness checks (DB ping, build hash, memory). There is no test collision: `tests/unit/healthz.test.ts` tests only `GET /api/healthz`; I's tests cover `GET /api/readyz`.

**Goal:** Add `src/app/api/healthz/route.ts` returning `{"status":"ok"}` with HTTP 200.
This is intentionally minimal — no DB ping, no build hash, no memory check (those belong
to I's `/api/readyz`). The route just proves the app is up and able to serve requests.

> **Ownership boundary:** C writes `src/app/api/healthz/route.ts` and `tests/unit/healthz.test.ts` (liveness only). I writes `src/app/api/readyz/route.ts` and its own test file (readiness: DB check, build hash, memory). No group may edit the other's route file or test file.

### C5-T1 — Failing test: healthz route

**File:** `tests/unit/healthz.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/healthz/route'

describe('GET /api/healthz', () => {
  it('returns 200 with {"status":"ok"}', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
  })
})
```

Run `pnpm exec vitest run tests/unit/healthz.test.ts` — fails today (route does not exist).

### C5-T2 — Implement minimal healthz route

**File:** `src/app/api/healthz/route.ts`

```typescript
import { NextResponse } from 'next/server'

/**
 * GET /api/healthz — liveness probe (owned by Group C; §7k).
 * Returns 200 {"status":"ok"} as long as the Next.js app is running.
 *
 * This is intentionally minimal: no DB ping, no build hash, no memory check.
 * Group I adds those checks in a SEPARATE /api/readyz endpoint.
 * This file must NOT be modified by Group I.
 */
export function GET() {
  return NextResponse.json({ status: 'ok' })
}
```

**Verification:**
```bash
pnpm exec vitest run tests/unit/healthz.test.ts
# Must pass: 1 test, 0 failures

# Integration check (requires running app):
curl -sf http://localhost:3000/api/healthz
# {"status":"ok"}
```

**Commit:** `git commit -m "C5: minimal /api/healthz liveness stub (C owns; I adds separate /api/readyz)"`

---

## Task C6 — CI: image-size gate + compose lint

### C6-T1 — Add compose validation to CI

Add a `compose-lint` job to `ci.yml` that validates the compose file using `docker compose config`.

> **Reconciliation §7p:** `docker compose config` (and `docker compose up`) will fail with a hard error on the `:?` required-var expansion unless `POSTGRES_PASSWORD` (and `PARCHMENT_SECRET_KEY`, which is also `:?`-required) are set. The CI job MUST supply these. `POSTGRES_USER` and `POSTGRES_DB` are optional (they have `:-` defaults) but are included for clarity.

```yaml
compose-lint:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Validate docker-compose.yml
      env:
        POSTGRES_PASSWORD: ci_test_pw
        POSTGRES_USER: parchment
        POSTGRES_DB: parchment
        PARCHMENT_SECRET_KEY: Y2ktdGVzdC1rZXktMzItYnl0ZXMtZm9yLWNpLW9ubHk=
        PARCHMENT_PUBLIC_URL: https://ci.example.com
      run: docker compose config --quiet
    - name: Validate docker-compose.dev.yml
      run: docker compose -f docker-compose.dev.yml config --quiet
```

The `image-size` job from C1-T1 also gates here. Both run on every PR.

**Commit:** `git commit -m "CI: add compose-lint + image-size gate jobs"`

---

## End-to-end smoke test (required before PR is merged)

This is the single hardest verification gate. Run it on the release branch before tagging.

```bash
# 0. Build the stripped image locally
docker build -t parchment:c-test .

# 1. Confirm image size
docker image inspect parchment:c-test --format '{{.Size}}'
# Must be < 629145600 (600 MB)

# 2. Write a .env for compose
# PARCHMENT_SECRET_KEY is REQUIRED — generate for the smoke test:
cat > /tmp/parchment-c-test.env << 'EOF'
POSTGRES_PASSWORD=smoke_test_pw_c1
POSTGRES_DB=parchment
POSTGRES_USER=parchment
PARCHMENT_VERSION=c-test
PARCHMENT_SECRET_KEY=$(openssl rand -base64 32)
PARCHMENT_PUBLIC_URL=http://localhost:3000
EOF

# 3. Start compose, overriding the app image to the local build
PARCHMENT_VERSION=c-test \
POSTGRES_PASSWORD=smoke_test_pw_c1 \
  docker compose \
  --env-file /tmp/parchment-c-test.env \
  up -d

# 4. Wait for health
sleep 20
docker compose ps
# Both db and app must show "running (healthy)" or "running"

# 5. App liveness endpoint (C's /api/healthz stub; Group I adds /api/readyz separately — §7k)
curl -sf http://localhost:3000/api/healthz | python3 -m json.tool
# {"status":"ok"}

# 6. Vector extension present in external DB
docker compose exec db psql -U parchment -d parchment \
  -c "SELECT extname, extversion FROM pg_extension WHERE extname='vector';"
# extname | extversion
# --------+-----------
#  vector | ...

# 7. Migrations ran (users table exists)
docker compose exec db psql -U parchment -d parchment \
  -c "SELECT to_regclass('public.users');"
# to_regclass
# ------------
#  users

# 8. Round-trip: create a document via the API
# (requires a valid session — manual browser test: open /setup, create account,
#  create a document, close browser, reopen, confirm document persists)

# 9. Confirm no embedded postgres process in app container
docker compose exec app sh -c 'ps aux | grep postgres | grep -v grep'
# Must output nothing (no postgres server in app container)

# 10. Tear down
docker compose down -v
```

Expected output for each step documented inline. No step may be skipped.

---

## File change summary

| File | Change |
|---|---|
| `Dockerfile` | Remove postgresql-18 **server** + postgresql-18-pgvector; keep postgresql-client-18 + PGDG repo (needed for client tools); remove PGDATA env, /var/lib/postgresql VOLUME, postgres user setup (§7p) |
| `rootfs/etc/s6-overlay/s6-rc.d/postgres/` | DELETE entire directory (3 files) |
| `rootfs/etc/s6-overlay/s6-rc.d/user/contents.d/postgres` | DELETE |
| `rootfs/etc/s6-overlay/s6-rc.d/migrate/dependencies.d/postgres` | DELETE (migrate no longer depends on s6 postgres service) |
| `rootfs/etc/parchment/migrate.sh` | Parse DB_HOST/PORT/USER/DB_NAME from DATABASE_URL for ALL invocations — `pg_isready`, `createdb`, schema-presence `psql` check, and apply loop; never hardcode `-U parchment -d parchment` (§7o) |
| `docker-compose.yml` | Rewrite: production 2-service compose (db + app, external pgvector); full §4 env-var registry incl. `PARCHMENT_PUBLIC_URL` (`:?`-required); `/api/healthz` app healthcheck |
| `.env.example` | NEW: full §4 env-var registry with all required + optional vars documented, incl. `PARCHMENT_PUBLIC_URL` (REQUIRED) |
| `docker-compose.dev.yml` | NEW: extracted dev compose (local pg on 5433) |
| `scripts/migrate-aio-to-compose.sh` | NEW: pg_dump/restore migration helper; uses `$POSTGRES_DB`/parse-from-URL, never hardcoded |
| `src/app/api/healthz/route.ts` | NEW: minimal liveness stub `{"status":"ok"}` — C owns this file; Group I adds `/api/readyz` separately (§7k) |
| `docs/readme-snippets/compose-quickstart.md` | NEW: compose quickstart SNIPPET for F3 to incorporate into README (C does NOT edit README) |
| `.github/workflows/ci.yml` | Add image-size + compose-lint jobs; compose-lint sets `POSTGRES_PASSWORD`/`POSTGRES_USER`/`POSTGRES_DB`/`PARCHMENT_SECRET_KEY` so `:?` expansions don't abort config validation (§7p) |
| `tests/unit/compose.test.ts` | NEW: compose structure + full §4 env-var registry coverage assertions |
| `tests/unit/healthz.test.ts` | NEW: C's unit test for `/api/healthz` liveness; Group I writes its own separate test file for `/api/readyz` (§7k, no collision) |

**Files C does NOT touch:**
| File | Why |
|---|---|
| `README.md` | F3 is the sole README author; C provides the snippet via `docs/readme-snippets/compose-quickstart.md` |

---

## Commit order

```
C1: strip embedded Postgres server from image; install pg-client-18 only
C2: production docker-compose.yml (app + external pgvector db); full §4 env-var registry; .env.example; dev compose
C3: all-in-one to compose migration script (pg_dump/restore; uses $POSTGRES_DB, not hardcoded)
C4: compose quickstart snippet for F3 (docs/readme-snippets/compose-quickstart.md)
C5: minimal /api/healthz stub for compose healthcheck (I will enhance)
C6: CI compose-lint + image-size gate jobs
```

Branch: `release/v0.2.0`
PR: one PR covering all of Group C (C1–C6).
