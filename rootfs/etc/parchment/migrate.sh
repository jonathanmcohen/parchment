#!/command/with-contenv sh
# Apply SQL migrations once Postgres is ready. Idempotent: skips if schema present.
# v0.1 uses a simple psql apply-in-order; replace with `drizzle-kit migrate` when
# the runtime image gains the toolchain.
set -e

echo "[parchment] waiting for postgres..."
until pg_isready -h localhost -U parchment >/dev/null 2>&1; do sleep 1; done

createdb -h localhost -U parchment parchment 2>/dev/null || true

EXISTS="$(psql -h localhost -U parchment -d parchment -tAc "select to_regclass('public.users')" 2>/dev/null || true)"
if [ -n "$EXISTS" ]; then
  echo "[parchment] schema present, skipping migrations"
  exit 0
fi

echo "[parchment] applying migrations"
for f in $(ls /app/src/db/migrations/*.sql | sort); do
  echo "  -> $(basename "$f")"
  psql -h localhost -U parchment -d parchment -v ON_ERROR_STOP=1 -f "$f"
done
echo "[parchment] migrations done"
