# Plan A — Foundations

Build order: **first**. Everything else stands on this. No editor/collab work until A1 green.

## A1 — Scaffold + infra (single container)
Repo, Biome v2 config, `tsconfig` (TS6 strict), Drizzle init. **One all-in-one image** (`node:24-bookworm-slim` base) running Postgres 18 + pgvector, Hocuspocus, and Next under **s6-overlay**. `docker-compose.yml` is **dev-only** (source mount + dev Postgres).
- **Accept:** `docker run` the single image → Next serves, collab reachable, Postgres up, all three s6 services report ready; `drizzle-kit push` applies a baseline migration; Biome lint clean.
- **Test:** Testcontainers spins PG, migration applies, health query returns; smoke test hits the running container's `/` and `/api/health`.
- **Note:** local dev node is 22.x; container pins 24. Build/verify the image to catch the gap, don't trust local-only runs.

## A2 — Auth
PAT issue/revoke + single local owner account (argon2id). OAuth 2.1 + SSO routes **stubbed** (return 501, documented for v0.2).
- **Accept:** login sets session; PAT authenticates an API call; bad PAT → 401; OAuth route returns 501 with v0.2 note.
- **Test:** auth middleware unit + e2e login.

## A3 — Settings shell
Route tree under `(app)/settings`: Account / Workspace / Admin / Developer / Notifications / Security. Mirror Cairn groupings; fewer leaf items OK at v0.1.
- **Accept:** every group renders, keyboard-reachable, axe clean.

## A4 — Audit log
Append-only table; log create/delete/share/export/login. Viewer in Settings → Admin.
- **Accept:** each event type writes one row with actor + target + ts; viewer paginates + filters by type. Shared impl with **I5**.
- **FM:** concurrent writes don't lose rows; log write failure never blocks the action.

## A5 — Health page
Status pills: DB, disk, search index, collab service. Extended by **I6** (Ollama, S3).
- **Accept:** each pill green/amber/red from a real probe; collab pill reflects Hocuspocus reachability.
- **FM:** a downed dependency shows red, not a crashed page.
