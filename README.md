# Parchment

A self-hostable, Google-Docs-style writing app with a Drive-style file manager.
**Markdown-first** — every document is mirrored to a real `.md` file on disk
(git-tracked and portable). One container. No external services required.

- Real-time collaboration (Yjs + Hocuspocus)
- Page-bounded rich editor (Tiptap / ProseMirror)
- Disk-mirrored Markdown (portable, git-trackable)
- Export to DOCX, HTML, EPUB, PDF (native `@page` printing)
- Dark mode, high-contrast, OpenDyslexic font, full keyboard navigation
- Multi-user with sharing (v0.2)

Multi-arch image (`amd64` + `arm64`) at `ghcr.io/jonathanmcohen/parchment`.

---

## Quick start

The production artifact is a **single image** — Postgres 18 + pgvector, the
Hocuspocus collab server, and the Next.js app — all supervised by
[s6-overlay](https://github.com/just-containers/s6-overlay).

Create a `docker-compose.yml`:

```yaml
services:
  app:
    image: ghcr.io/jonathanmcohen/parchment:latest
    ports:
      - "3000:3000"   # web app
      - "1234:1234"   # collab websocket
    volumes:
      - parchment_pg:/var/lib/postgresql
      - parchment_data:/data
    environment:
      SECURE_COOKIES: "true"          # set if served over HTTPS
      PARCHMENT_RP_ID: "example.com"  # bare domain for passkeys (production)
      PARCHMENT_RP_ORIGIN: "https://example.com"  # full origin for passkeys

volumes:
  parchment_pg:
  parchment_data:
```

Then:

```bash
docker compose up -d
```

Open `http://localhost:3000` and complete **first-run setup at `/setup`** to
create the owner account. A **Parchment Guide** workspace is seeded on first
run.

The two volumes hold all your state:

- `/var/lib/postgresql` — the bundled Postgres data directory.
- `/data` — the disk-mirrored Markdown files (`PARCHMENT_FILES_ROOT` defaults
  to `/data/files`).

### Upgrading

```bash
docker compose pull && docker compose up -d
```

Migrations run automatically on boot (idempotent). Data lives in the volumes
and survives upgrades.

---

## Environment reference

Every variable below is read somewhere in the codebase. **Core** vars have safe
defaults baked into the image; the **optional integrations are off by default**
— leaving them unset simply disables that feature (no external call is ever
made).

### Core

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | `postgres://parchment:parchment@localhost:5432/parchment` | Postgres connection string. In the all-in-one image this points at the bundled instance. |
| `PORT` | `3000` | Port the Next.js server listens on. |
| `COLLAB_PORT` | `1234` | Port the Hocuspocus collab server listens on. |
| `COLLAB_URL` | `ws://localhost:1234` | Server-side collab URL (health probes). |
| `NEXT_PUBLIC_COLLAB_URL` | `ws://localhost:1234` | **Browser-facing** collab websocket URL the editor connects to. Set this to your public origin when the collab port is reached through a different host/proxy. |
| `PARCHMENT_FILES_ROOT` | `/data/files` (image) | Root directory for the disk-mirrored Markdown files. |
| `NODE_ENV` | `production` (image) | Standard Node mode. |
| `SECURE_COOKIES` | unset | Set to `true` to force the `Secure` flag on the session cookie — needed behind a TLS-terminating reverse proxy (Caddy/nginx). Leave unset for plain http (local dev). |
| `PUBLIC_URL` | falls back to `PARCHMENT_RP_ORIGIN`, then `http://localhost:3000` | The **public** base URL (`scheme://host[:port]`) used to build copyable absolute share links. MUST be your public host as seen by browsers. |

### Authentication / passkeys

| Variable | Default | What it does |
|---|---|---|
| `PARCHMENT_RP_ID` | `localhost` (dev) | WebAuthn Relying Party ID — the bare domain (no scheme/port). **Required in production** for passkeys. |
| `PARCHMENT_RP_ORIGIN` | `http://localhost:3000` (dev) | WebAuthn origin — the full `scheme://host[:port]`. **Required in production** for passkeys. |

### Optional integrations (off by default)

| Variable(s) | Enables |
|---|---|
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | AI compose sleeve. Point at any OpenAI-compatible chat endpoint. |
| `EMBEDDINGS_URL`, `EMBEDDINGS_API_KEY`, `EMBEDDINGS_MODEL` | Semantic search. |
| `NEXT_PUBLIC_PLANTUML_SERVER_URL` | PlantUML diagram rendering. |
| `NEXT_PUBLIC_DRAWIO_EMBED_URL` | draw.io diagram editing. |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_REGION` | Off-site S3-compatible backups. |
| `CAIRN_BASE_URL` | Cairn integration for `[[cairn://…]]` links. |
| `GITHUB_TOKEN` | GitHub embeds (file/gist content). |
| `LANGUAGETOOL_URL`, `LANGUAGETOOL_API_KEY`, `LANGUAGETOOL_USERNAME` | Grammar checking via LanguageTool. |
| `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET` | Email-in webhook. |

> **Accuracy note:** this list is derived from `grep -rhoE 'process\.env\.[A-Z_]+' src`.
> If you add a new env var, update this table.

---

## Development

**Prerequisites:** Node **24+** and **pnpm** (`corepack enable`).

This setup runs two dev Postgres instances on non-standard host ports because
**host `5432` is already taken** here:

- **`5433`** — dev database (used by `pnpm dev` / `pnpm collab`).
- **`5434`** — e2e/test database.

```bash
pnpm install

# .env (dev):
#   DATABASE_URL=postgres://parchment:parchment@localhost:5433/parchment
#   COLLAB_PORT=1234
#   COLLAB_URL=ws://localhost:1234
#   PARCHMENT_FILES_ROOT=/tmp/parchment-dev/files

pnpm dev        # Next.js dev server (http://localhost:3000)
pnpm collab     # Hocuspocus collab server — needs DATABASE_URL set
```

The collab process (`pnpm collab`) talks to the same Postgres as the app, so
it needs `DATABASE_URL` in its environment too.

> The `docker-compose.yml` at the repo root is **development only** — it mounts
> the source tree and spins up a standalone dev Postgres. It is not the
> production deployment path.

---

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server (Turbopack). |
| `pnpm build` | Production build (Turbopack). |
| `pnpm collab` | Hocuspocus collab server (`tsx collab/server.ts`). |
| `pnpm test` | Unit + integration tests (Vitest). |
| `pnpm test:e2e` | Playwright end-to-end tests + axe-core a11y checks. |
| `pnpm lint` | `biome check .` (lint + format check). |
| `pnpm format` | `biome format --write .`. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm db:generate` / `db:push` / `db:migrate` | Drizzle Kit migration helpers (dev). |

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router + RSC + Turbopack), React 19 |
| Language | TypeScript 6 (strict), Biome v2 |
| DB | Postgres 18 + pgvector, Drizzle ORM |
| Editor | Tiptap / ProseMirror + markdown extension |
| Collab | Yjs + Hocuspocus (`parchment-collab`) — own Node process, **same container** |
| UI | Tailwind |
| Print/PDF | Native `@page` printing per content-split sheet |
| DOCX | mammoth (round-trip) |
| Code render | shiki (render) + highlight.js/auto (classify) |
| Test | Testcontainers + Vitest 4 + Playwright e2e + axe-core a11y |
| Docker base | `node:24-bookworm-slim` |

---

## Layout

```
parchment/
  plans/                       # Plan A–L breakdowns (one file per plan)
  scope.md                     # master audit / coverage tracker
  README.md
  Dockerfile                   # single all-in-one image (Postgres + collab + Next, s6-overlay)
  docker-compose.yml           # DEV ONLY (source mount, dev Postgres)
  rootfs/                      # s6 service tree (postgres → migrate → collab/next)
  collab/                      # Hocuspocus collab server (separate Node process)
  src/
    app/                       # Next.js routes (App Router) + API
    components/                # editor, file-manager, settings, help, …
    db/{schema.ts,migrations/} # Drizzle schema + SQL migrations
    lib/                       # markdown, disk-mirror, export/import, auth, search, …
  tests/                       # unit + integration (Vitest) + e2e (Playwright + axe)
```

## Honesty constraint

No item is "done" until browser-verified. Per-PR artifacts: spec path ·
RED-on-main · GREEN-on-branch · live-deploy screenshot · axe-core
zero-violations report on the affected route. Anything that doesn't ship is
logged `GAP` in `scope.md`, not silently dropped.
