# Parchment

Parchment is a self-hostable, Google-Docs-style writing app with a Drive-style
file manager. It is **markdown-first** — every document is mirrored to a real
`.md` file on disk (git-tracked and portable) — with a rich, page-bounded editor,
real-time collaboration, and a single all-in-one container you can `docker run` on
your own homelab. No external services are required to run it.

- **v0.1** — single-user (owner only).
- **v0.2** — multi-user + sharing.

Multi-arch image (amd64 + arm64) at `ghcr.io/jonathanmcohen/parchment` (mirrors
Cairn's release pattern).

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router + RSC + Turbopack), React 19 |
| Language | TypeScript 6 (strict), Biome v2 |
| DB | Postgres 18 + pgvector, Drizzle ORM |
| Editor | Tiptap / ProseMirror + markdown extension |
| Collab | Yjs + Hocuspocus (`parchment-collab`) — own Node process, **same container** |
| UI | Tailwind + shadcn/ui |
| Print/PDF | paged.js |
| docx | mammoth (round-trip) |
| Code render | shiki (render) + highlight.js/auto (classify) |
| Test | Testcontainers + Vitest 4 + Playwright e2e + axe-core a11y |
| Docker base | `node:24-bookworm-slim` |

---

## Quick start (Docker)

The production artifact is **one image** — Postgres 18 + pgvector, the Hocuspocus
collab server, and the Next.js app, all supervised by [s6-overlay](https://github.com/just-containers/s6-overlay)
(see the [`Dockerfile`](./Dockerfile)). `docker run` it with two volumes and the
two ports and you have a working Parchment:

```bash
docker run -d --name parchment \
  -p 3000:3000 \            # Next.js app
  -p 1234:1234 \            # Hocuspocus collab websocket
  -v parchment_pg:/var/lib/postgresql \   # Postgres data
  -v parchment_data:/data \               # disk-mirrored Markdown files
  ghcr.io/jonathanmcohen/parchment:v0.1.0
```

Then open `http://localhost:3000` and complete **first-run setup at `/setup`** to
create the owner account. A small **Parchment Guide** workspace is seeded on first
run so the install isn't empty.

The two volumes hold all your state:

- `/var/lib/postgresql` — the bundled Postgres data directory.
- `/data` — the disk-mirrored Markdown files (`PARCHMENT_FILES_ROOT` defaults to
  `/data/files`).

> `docker-compose.yml` exists for **development only** (live source mount + a
> standalone dev Postgres). Production is the single image above.

---

## Environment reference

Every variable below is read somewhere in the codebase. **Core** vars have safe
defaults baked into the image; the **optional integrations are off by default** —
leaving them unset simply disables that feature (no external call is ever made).

### Core

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | `postgres://parchment:parchment@localhost:5432/parchment` | Postgres connection string. In the all-in-one image this points at the bundled instance. |
| `PORT` | `3000` | Port the Next.js server listens on. |
| `COLLAB_PORT` | `1234` | Port the Hocuspocus collab server listens on. |
| `COLLAB_URL` | `ws://localhost:1234` | Server-side collab URL (health probes). |
| `NEXT_PUBLIC_COLLAB_URL` | `ws://localhost:1234` | **Browser-facing** collab websocket URL the editor connects to. Set this to your public origin when the collab port is reached through a different host/proxy. |
| `PARCHMENT_FILES_ROOT` | `/data/files` (image) | Root directory for the disk-mirrored Markdown files. |
| `NODE_ENV` | `production` (image) | Standard Node mode. In `production` the session cookie is sent `Secure` (https-only). Run the image **with `NODE_ENV=production`** when it's served over https. |
| `SECURE_COOKIES` | unset | Set to `true` to force the `Secure` flag on the session cookie even when `NODE_ENV` is not `production` — needed behind a TLS-terminating reverse proxy (Caddy/nginx) if the container runs with the default `NODE_ENV`. Leave unset (or `false`) for plain http (local dev), otherwise the browser drops the cookie and login/theme-save fail. |
| `PUBLIC_URL` | falls back to `PARCHMENT_RP_ORIGIN`, then `http://localhost:3000` | The **public** base URL (`scheme://host[:port]`) used to build copyable absolute share links (`/share/<token>`). MUST be your public host as seen by browsers — behind a reverse proxy the app's own request origin is the internal `0.0.0.0:3000` bind, which would otherwise leak into the link. Optional: if unset it defaults to `PARCHMENT_RP_ORIGIN` (which the deploy already sets for passkeys), so a **redeploy** self-corrects existing share links with no new config. Set it explicitly only to override that. A change takes effect on redeploy. |

### Authentication / passkeys

| Variable | Default | What it does |
|---|---|---|
| `PARCHMENT_RP_ID` | `localhost` (dev) | WebAuthn Relying Party ID — the bare domain (no scheme/port). **Required in production** for passkeys; never derived from request headers. |
| `PARCHMENT_RP_ORIGIN` | `http://localhost:3000` (dev) | WebAuthn origin — the full `scheme://host[:port]`. **Required in production** for passkeys. |

### Optional integrations (off by default)

| Variable(s) | Enables |
|---|---|
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | AI compose sleeve. Point at any OpenAI-compatible chat endpoint to enable the in-editor AI writing actions. Unset → the AI menu/endpoints are disabled. |
| `EMBEDDINGS_URL`, `EMBEDDINGS_API_KEY`, `EMBEDDINGS_MODEL` | Semantic (similarity) search. Set the embeddings endpoint to generate document vectors and enable semantic search; unset → keyword search only. |
| `NEXT_PUBLIC_PLANTUML_SERVER_URL` | PlantUML diagram rendering. URL of a PlantUML server used to render `plantuml` diagram blocks. |
| `NEXT_PUBLIC_DRAWIO_EMBED_URL` | draw.io diagram editing. URL of the embedded draw.io editor used by the drawing modal. |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_REGION` | Off-site backups. Configure an S3-compatible bucket to enable scheduled/on-demand backup uploads; unset → local backup export only. |
| `CAIRN_BASE_URL` | Cairn integration. Base URL of a Cairn instance for `[[cairn://…]]` link search/preview/backlinks. |
| `GITHUB_TOKEN` | GitHub embeds. Token used to fetch file/gist content for GitHub embed blocks (raises rate limits / private access). |
| `LANGUAGETOOL_URL`, `LANGUAGETOOL_API_KEY`, `LANGUAGETOOL_USERNAME` | Grammar checking via LanguageTool. Set `LANGUAGETOOL_URL` to a self-hosted or cloud instance to enable the grammar action (proxied server-side, so the key never reaches the browser); unset → the grammar endpoint 404s. |
| `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET` | Email-in. Domain + shared secret for the inbound-email webhook that appends emailed content to a document. |

> **Accuracy note:** this list is derived from the actual `process.env` reads in
> the source (`grep -rhoE 'process\.env\.[A-Z_]+' src`). If you add a new env var,
> update this table — see the GAP note at the bottom.

---

## Development

**Prerequisites:** Node **24+** and **pnpm** (`corepack enable`).

This setup runs two dev Postgres instances on non-standard host ports because
**host `5432` is already taken** here:

- **`5433`** — dev database (used by `pnpm dev` / `pnpm collab`; container
  `parchment-pg-dev`, also the `db` service in `docker-compose.yml`).
- **`5434`** — e2e/test database (container `parchment-e2e-pg`).

```bash
pnpm install

# .env (dev) — point DATABASE_URL at the 5433 dev DB:
#   DATABASE_URL=postgres://parchment:parchment@localhost:5433/parchment
#   COLLAB_PORT=1234
#   COLLAB_URL=ws://localhost:1234
#   PARCHMENT_FILES_ROOT=/tmp/parchment-dev/files

pnpm dev        # Next.js dev server (http://localhost:3000)
pnpm collab     # Hocuspocus collab server — needs DATABASE_URL set
```

The collab process (`pnpm collab`) talks to the same Postgres as the app, so it
needs `DATABASE_URL` in its environment too.

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

## Upgrade

Parchment ships as a single image, so upgrading is just pulling the new tag:

```bash
docker pull ghcr.io/jonathanmcohen/parchment:vX.Y.0
docker rm -f parchment
docker run -d --name parchment \
  -p 3000:3000 -p 1234:1234 \
  -v parchment_pg:/var/lib/postgresql \
  -v parchment_data:/data \
  ghcr.io/jonathanmcohen/parchment:vX.Y.0
```

**Migrations run automatically on boot.** The s6 `migrate` service applies SQL
migrations in order once Postgres is ready and **before** the `next` app service
starts (it is idempotent and skips when the schema is already present). Your data
survives the upgrade because it lives in the two persistent volumes
(`/var/lib/postgresql` and `/data`).

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

No item is "done" until browser-verified. Per-PR artifacts: spec path · RED-on-main
· GREEN-on-branch · live-deploy screenshot · axe-core zero-violations report on the
affected route. Anything that doesn't ship is logged `GAP` in `scope.md`, not
silently dropped.
