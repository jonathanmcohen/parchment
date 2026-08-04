#!/usr/bin/env bash
# Behavioural test for rootfs/etc/parchment/migrate.sh.
#
# Why this is a script and not a vitest integration test: migrate.sh needs psql,
# createdb and pg_isready on the machine that RUNS it, and tests/integration is
# excluded from the CI vitest run anyway (`--exclude '**/integration/**'`), so a
# test placed there would never gate a release. This runs entirely in containers,
# needs nothing but docker, and is wired into CI as its own job.
#
# It pins the four behaviours the v0.2.15 fix is about:
#   1. a fresh database gets bookkeeping and records every migration
#   2. a second boot applies NOTHING (the actual bug: every boot replayed all 28)
#   3. a pre-v0.2.15 database with no bookkeeping reconciles tolerantly
#   4. once bookkeeping is trusted, a broken migration HALTS the boot
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NET="parchment-migrate-test-$$"
PG="parchment-migrate-pg-$$"
PGIMAGE="${PGIMAGE:-pgvector/pgvector:pg17}"
DBURL="postgres://parchment:parchment@db:5432/parchment"

pass=0
fail=0

cleanup() {
  docker rm -f "$PG" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

ok()   { echo "  PASS  $1"; pass=$((pass + 1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail + 1)); }

# Run migrate.sh in a psql-equipped container against the test database.
# $1 = migrations dir inside the container. Echoes output; returns the exit code.
run_migrate() {
  docker run --rm --network "$NET" \
    -v "$REPO:/w:ro" \
    -e DATABASE_URL="$DBURL" \
    -e PARCHMENT_MIGRATIONS_DIR="${1:-/w/src/db/migrations}" \
    "$PGIMAGE" sh /w/rootfs/etc/parchment/migrate.sh 2>&1
}

q() {
  docker exec -e PGPASSWORD=parchment "$PG" \
    psql -U parchment -d parchment -tAc "$1" 2>/dev/null | tr -d '[:space:]'
}

echo "== starting postgres ($PGIMAGE) =="
docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" --network-alias db \
  -e POSTGRES_USER=parchment -e POSTGRES_PASSWORD=parchment -e POSTGRES_DB=parchment \
  "$PGIMAGE" >/dev/null

for _ in $(seq 1 60); do
  docker exec "$PG" pg_isready -U parchment >/dev/null 2>&1 && break
  sleep 1
done
echo "postgres ready"

TOTAL=$(find "$REPO/src/db/migrations" -name '*.sql' | wc -l | tr -d ' ')
echo "migrations on disk: $TOTAL"

echo
echo "== case 1: fresh database =="
out1="$(run_migrate)"
echo "$out1" | grep -q 'no migration bookkeeping found' \
  && ok "took the bootstrap path" || bad "did not report a missing bookkeeping table"
[ "$(q "SELECT to_regclass('public.migrations') IS NOT NULL;")" = "t" ] \
  && ok "created the migrations table" || bad "migrations table still absent"
[ "$(q 'SELECT count(*) FROM migrations;')" = "$TOTAL" ] \
  && ok "recorded all $TOTAL migrations" || bad "recorded $(q 'SELECT count(*) FROM migrations;') of $TOTAL"
[ "$(q "SELECT to_regclass('public.documents') IS NOT NULL;")" = "t" ] \
  && ok "schema actually built" || bad "documents table missing"

echo
echo "== case 2: second boot applies nothing (the bug) =="
out2="$(run_migrate)"
echo "$out2" | grep -q 'applying pending migrations only' \
  && ok "took the tracked path" || bad "did not report bookkeeping present"
if echo "$out2" | grep -q 'applying migration:'; then
  bad "replayed migrations on a tracked database"
  echo "$out2" | grep 'applying migration:' | head -3 | sed 's/^/        /'
else
  ok "applied zero migrations"
fi
[ "$(q 'SELECT count(*) FROM migrations;')" = "$TOTAL" ] \
  && ok "bookkeeping unchanged" || bad "row count drifted"

echo
echo "== case 3: pre-v0.2.15 database, schema present but no bookkeeping =="
docker exec -e PGPASSWORD=parchment "$PG" \
  psql -U parchment -d parchment -q -c 'DROP TABLE migrations;' >/dev/null
out3="$(run_migrate)" && rc3=0 || rc3=$?
[ "${rc3:-0}" -eq 0 ] \
  && ok "reconciled without failing the boot" || bad "exited $rc3 on an existing database"
echo "$out3" | grep -q 'no migration bookkeeping found' \
  && ok "took the bootstrap path again" || bad "misdetected the missing table"
[ "$(q 'SELECT count(*) FROM migrations;')" = "$TOTAL" ] \
  && ok "re-recorded all $TOTAL" || bad "recorded $(q 'SELECT count(*) FROM migrations;') of $TOTAL"
[ "$(q "SELECT to_regclass('public.documents') IS NOT NULL;")" = "t" ] \
  && ok "existing schema survived" || bad "schema damaged by the tolerant pass"

echo
echo "== case 4: broken migration halts the boot once bookkeeping is trusted =="
BROKEN="$REPO/.migrate-test-broken"
rm -rf "$BROKEN"; mkdir -p "$BROKEN"
cp "$REPO"/src/db/migrations/*.sql "$BROKEN/"
[ "$(find "$BROKEN" -name '*.sql' | wc -l | tr -d ' ')" -gt 0 ] || { echo "  FAIL  could not stage migrations"; exit 1; }
echo 'THIS IS NOT VALID SQL;' > "$BROKEN/9999_deliberately_broken.sql"
set +e
out4="$(docker run --rm --network "$NET" -v "$BROKEN:/m:ro" -v "$REPO:/w:ro" \
  -e DATABASE_URL="$DBURL" -e PARCHMENT_MIGRATIONS_DIR=/m \
  "$PGIMAGE" sh /w/rootfs/etc/parchment/migrate.sh 2>&1)"
rc4=$?
set -e
rm -rf "$BROKEN"
[ "$rc4" -ne 0 ] \
  && ok "non-zero exit ($rc4) so s6 fails the boot" \
  || bad "exited 0 despite a broken migration - the swallow is back"
if [ "$(q "SELECT count(*) FROM migrations WHERE name='9999_deliberately_broken';")" = "0" ]; then
  ok "did not record the failed migration"
else
  bad "recorded a migration that never applied"
fi
echo "$out4" | grep -q 'migrations complete' \
  && bad "claimed completion after a failure" || ok "did not claim completion"

echo
echo "== $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
