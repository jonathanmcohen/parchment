# Parchment

Google-Docs-style writing app with a Drive-style file manager. Markdown-first authoring, page-bounded canvas, real-time collab. Self-hostable on a homelab.

- **v0.1** — single-user (owner only).
- **v0.2** — multi-user + sharing.

Deployed at `parchment.local.jonco.dev`. Multi-arch image at `ghcr.io/jonathanmcohen/parchment` (mirrors Cairn's release pattern).

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router + RSC + Turbopack), React 19 |
| Language | TypeScript 6 (strict), Biome v2 |
| DB | Postgres 18 + pgvector, Drizzle ORM |
| Editor | Tiptap / ProseMirror + markdown extension |
| Collab | Yjs + Hocuspocus (`parchment-collab`, same shape as `cairn-collab`) — own process, **same container** |
| UI | Tailwind + shadcn/ui |
| Print/PDF | paged.js |
| docx | mammoth (round-trip) |
| Code render | shiki (render) + highlight.js/auto (classify) |
| Test | Testcontainers + Vitest 4 + Playwright e2e + axe-core a11y |
| Docker base | `node:24-bookworm-slim` |

## Layout

```
parchment/
  plans/                       # Plan A–L breakdowns (one file per plan)
  scope.md                     # master audit / coverage tracker (104 items)
  README.md
  docker-compose.yml           # DEV ONLY (live source mount, dev Postgres). Prod is the single image.
  Dockerfile                   # single all-in-one image: Postgres 18 + pgvector + Hocuspocus + Next (s6-overlay)
  src/
    app/                       # Next.js routes
      (app)/files/             # file manager
      (app)/d/[id]/            # doc editor
      (app)/settings/          # settings tree
      (app)/inbox/             # notifications
      (app)/trash/             # trash
      (app)/templates/         # template gallery
      api/                     # REST + Yjs websocket bridge
    components/editor/         # Tiptap config + page canvas + slash menu + suggestions
    components/file-manager/   # tree + list + breadcrumbs + context menu + drag-drop
    components/diff/           # version diff view (visual + unified markdown)
    components/comments/       # threaded comment sidebar
    db/{schema.ts,migrations/}
    lib/
      markdown/ export/ import/ git/ shiki/ collab/ ai/ paged/
  collab/                      # Hocuspocus server (separate Node process)
  tests/
```

## Build order

Internal: **B → core → collab → file manager → tiers**. Release is **one image, single tag v0.1.0**.

## Architecture — single container

One container runs everything, supervised by **s6-overlay**:

1. **Postgres 18 + pgvector** — data dir on a mountable volume (`/var/lib/postgresql`).
2. **Hocuspocus** collab server (Node process).
3. **Next.js** app server.

No external services required. `docker run` one image → working Parchment. `docker-compose.yml` exists for **dev only** (source mount + faster Postgres iteration); production is the single image. Multi-arch (amd64 + arm64) at `ghcr.io/jonathanmcohen/parchment:v0.1.0`.

## Status

Scaffold + plans + scope tracker in place. Awaiting GO on Plan A. See `scope.md` for per-item status.

## Honesty constraint

No item is "done" until browser-verified. Per-PR artifacts required: spec path · RED-on-main · GREEN-on-branch · live-deploy screenshot · axe-core zero-violations report on the affected route. Anything that doesn't ship is logged `GAP` in `scope.md`, not silently dropped.
