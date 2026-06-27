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
