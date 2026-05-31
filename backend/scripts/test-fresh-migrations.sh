#!/usr/bin/env bash
# S0.6 integration test — prove the Drizzle migrations stand up a complete TaskClaw
# schema from scratch on a plain Postgres + pgvector (no Supabase). Used in CI and
# before any prod baseline-adopt.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER=tc-fresh-test
IMAGE=pgvector/pgvector:pg16

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "→ starting $IMAGE"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
for i in $(seq 1 30); do docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done

docker exec "$CONTAINER" psql -U postgres -d postgres -q -c \
  'CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;' >/dev/null

for f in drizzle/0000_baseline.sql drizzle/0001_functions.sql drizzle/0002_auth_local.sql; do
  echo "→ applying $f"
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$f"
done

echo "→ asserting"
read -r tables pwhash refresh reset trig vecfn <<<"$(docker exec "$CONTAINER" psql -U postgres -d postgres -tAF' ' -c "
select
  (select count(*) from information_schema.tables where table_schema='public'),
  (select count(*) from information_schema.columns where table_schema='public' and table_name='users' and column_name='password_hash'),
  (to_regclass('public.refresh_tokens') is not null)::int,
  (to_regclass('public.password_reset_tokens') is not null)::int,
  (select count(*) from information_schema.triggers where trigger_name='on_public_user_created'),
  (select count(*) from pg_proc where proname like 'search_%_vector');")"

fail=0
[ "$tables" -ge 63 ] || { echo "✗ expected >=63 tables, got $tables"; fail=1; }
[ "$pwhash" = 1 ]    || { echo "✗ users.password_hash missing"; fail=1; }
[ "$refresh" = 1 ]   || { echo "✗ refresh_tokens missing"; fail=1; }
[ "$reset" = 1 ]     || { echo "✗ password_reset_tokens missing"; fail=1; }
[ "$trig" = 1 ]      || { echo "✗ on_public_user_created trigger missing"; fail=1; }
[ "$vecfn" -ge 3 ]   || { echo "✗ vector search functions missing ($vecfn)"; fail=1; }

if [ "$fail" = 0 ]; then echo "✓ fresh-DB migrations OK (tables=$tables, vecfns=$vecfn)"; else exit 1; fi
