#!/command/with-contenv sh
set -e

# Parse ALL connection params from DATABASE_URL.
# Expected format: postgres://user:pass@host:port/db  (or postgresql://...)
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+)[:/].*|\1|')
DB_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
DB_PASS=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|' | grep -E '^[0-9]+$' || echo "5432")
# DB_NAME: parsed from URL path; fall back to $POSTGRES_DB (never hardcode 'parchment').
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+)(\?.*)?$|\1|')
DB_NAME="${DB_NAME:-${POSTGRES_DB:-parchment}}"

# Export PGPASSWORD so pg client tools don't prompt interactively.
export PGPASSWORD="$DB_PASS"

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
# Iterate over /app/src/db/migrations/*.sql in order.
# Each psql call uses $DB_USER/$DB_NAME — never hardcoded.
for SQL_FILE in $(ls /app/src/db/migrations/*.sql 2>/dev/null | sort); do
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
