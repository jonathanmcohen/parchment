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
