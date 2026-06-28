# `parchment` CLI

A small command-line client for a self-hosted Parchment instance. It talks to the
REST API over HTTP using a **Personal Access Token (PAT)**, so it works against a
remote instance without local database access.

## Install / run

The CLI ships in this repo and runs through `tsx` (no build step):

```bash
pnpm cli <command> [args] [flags]
```

`package.json` declares a `parchment` bin, so after a global link (`pnpm link
--global`) you can also run:

```bash
parchment <command> [args] [flags]
```

## Authentication

Create a PAT in **Settings → Developer**. Choose the scope you need:

- **`docs:read`** — read-only commands (`docs list`, `search`, `backup export`).
- **`docs:write`** — read **and** mutate (`docs import`, `backup restore`). A
  `docs:read` token cannot mutate; the server returns `403 insufficient_scope` and
  the CLI exits non-zero with a message.

Pass the token and base URL via flags or environment variables:

| Flag        | Env var            | Default                  |
|-------------|--------------------|--------------------------|
| `--url`     | `PARCHMENT_URL`    | `http://localhost:3000`  |
| `--token`   | `PARCHMENT_TOKEN`  | (required)               |

```bash
export PARCHMENT_URL=https://docs.example.com
export PARCHMENT_TOKEN=pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Commands

| Command                     | Method / endpoint            | Scope        |
|-----------------------------|------------------------------|--------------|
| `docs list`                 | `GET /api/docs`              | `docs:read`  |
| `docs import <file>`        | `POST /api/docs/import`      | `docs:write` |
| `search <query>`            | `GET /api/search`           | `docs:read`  |
| `backup export <out.zip>`   | `GET /api/backup/export`     | `docs:read`  |
| `backup restore <in.zip>`   | `POST /api/backup/restore`   | `docs:write` |
| `whoami`                    | (token probe)                | `docs:read`  |

Import accepts **`.md` and `.docx` only** (the locked import scope).

### Global flags

- `--json` — emit machine-readable JSON instead of human text.
- `--dry-run` — print what would happen without mutating (import / restore / export).
- `--help`, `-h` — usage.
- `--version`, `-v` — CLI version.

## Examples

```bash
# List your documents (tab-separated id<TAB>title)
parchment docs list

# Import a markdown file and print the new doc id
parchment docs import notes.md

# Full-text search
parchment search "quarterly report"

# Download a workspace backup zip
parchment backup export backup-$(date +%F).zip

# Restore from a backup (needs a docs:write token)
parchment backup restore backup-2026-06-27.zip

# Verify a token works
parchment whoami
```

## Notes

- Operator-level operations that have no REST surface (database `migrate`, first
  user bootstrap) are run inside the container, not through this CLI — see the
  deployment docs. The CLI is intentionally a thin, network-only client so it can
  be installed on any machine that can reach the instance.
- Exit codes: `0` on success, `1` on any error (bad token, missing scope, network
  failure, unknown command).
