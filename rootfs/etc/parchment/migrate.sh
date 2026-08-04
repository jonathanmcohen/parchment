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

# Shorthand — every psql call uses $DB_USER/$DB_NAME, never a hardcoded value.
psql_q() { psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"; }

# Where the .sql files live. The image path is the default; the override exists
# so the behavioural test can drive this script against a throwaway database
# without a container layout.
MIGRATIONS_DIR="${PARCHMENT_MIGRATIONS_DIR:-/app/src/db/migrations}"

# ── 1. Wait for Postgres ───────────────────────────────────────────────────────
echo "[parchment] waiting for postgres at $DB_HOST:$DB_PORT as $DB_USER ..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do sleep 2; done
echo "[parchment] postgres ready"

# ── 2. Ensure DB exists ────────────────────────────────────────────────────────
# createdb is a no-op if the DB was already created by the pgvector image
# (POSTGRES_DB). Keep the || true guard.
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" 2>/dev/null || true

# ── 3. Ensure the bookkeeping table exists ─────────────────────────────────────
# v0.2.15 bugfix. Every release up to v0.2.14 READ this table and INSERTed into
# it, but nothing ever CREATED it — no migration file, no line of this script.
# The INSERT was guarded `2>/dev/null || true`, so its failure was silent, and
# `psql -f` without ON_ERROR_STOP exits 0 even when every statement errors, so
# `set -e` never tripped. Net effect: bookkeeping never persisted and EVERY boot
# replayed EVERY migration. Harmless only because the DDL is all IF NOT EXISTS.
# It stops being harmless the first time a migration carries a backfill, an
# UPDATE, an INSERT, or an unguarded ALTER — that would re-run on every restart.
#
# Probe BEFORE creating: that is what distinguishes a database with no
# bookkeeping (every pre-v0.2.15 deployment, and genuinely fresh ones) from one
# already tracking what it has applied.
# Ask for a boolean, not the regclass itself. The pre-v0.2.15 script compared
# the raw value against the literal string 'public.migrations', but regclass
# renders SCHEMA-QUALIFIED ONLY when the schema is outside search_path — with
# the default search_path it comes back as plain 'migrations', so that equality
# could never match and the script reported "fresh database" even in the case
# where the table did exist. A boolean has no such ambiguity.
PRE_EXISTING=$(psql_q -tAc \
  "SELECT to_regclass('public.migrations') IS NOT NULL;" 2>/dev/null | tr -d '[:space:]' || echo "f")

psql_q -v ON_ERROR_STOP=1 -q -c "CREATE TABLE IF NOT EXISTS migrations (
  name       text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);"

if [ "$PRE_EXISTING" = "t" ]; then
  BOOTSTRAP=0
  echo "[parchment] migration bookkeeping present; applying pending migrations only"
else
  BOOTSTRAP=1
  echo "[parchment] no migration bookkeeping found; one tolerant reconciliation pass"
fi

# ── 4. Apply pending migrations ────────────────────────────────────────────────
# Two modes, and the distinction is the whole point of the fix:
#
#   BOOTSTRAP=1  The database predates bookkeeping, so its schema may be fully
#                present, partly present, or empty and we cannot tell which.
#                Run every migration tolerantly — "already exists" is the
#                EXPECTED outcome here, not an error — and record each one.
#                This is correct whatever version the database sits at, which a
#                blanket "mark everything applied" backfill would not be: that
#                would silently skip migrations a stale database genuinely needs.
#
#   BOOTSTRAP=0  Bookkeeping is trustworthy, so anything unapplied is genuinely
#                new. Run it strictly: ON_ERROR_STOP=1 plus `set -e` means a
#                failing migration halts the boot instead of being swallowed and
#                then marked applied — which is exactly how the old script could
#                have recorded a migration that never actually ran.
for SQL_FILE in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  MIGRATION_NAME=$(basename "$SQL_FILE" .sql)
  ALREADY_RAN=$(psql_q -tAc "SELECT name FROM migrations WHERE name='$MIGRATION_NAME';" 2>/dev/null || echo "")
  [ -n "$ALREADY_RAN" ] && continue

  echo "[parchment] applying migration: $MIGRATION_NAME"
  if [ "$BOOTSTRAP" = "1" ]; then
    psql_q -f "$SQL_FILE" || true
  else
    psql_q -v ON_ERROR_STOP=1 -f "$SQL_FILE"
  fi

  # Record it. ON CONFLICT keeps a concurrent or repeated run idempotent, and
  # ON_ERROR_STOP means a failure to record is loud rather than silent — an
  # unrecorded migration would otherwise replay forever.
  psql_q -v ON_ERROR_STOP=1 -q -c \
    "INSERT INTO migrations (name, applied_at) VALUES ('$MIGRATION_NAME', now())
     ON CONFLICT (name) DO NOTHING;"
done

echo "[parchment] migrations complete"
