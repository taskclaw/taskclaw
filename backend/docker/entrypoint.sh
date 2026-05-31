#!/bin/sh
set -e

# ============================================================
# TaskClaw Backend — Docker Entrypoint (plain PostgreSQL stack)
# ============================================================
# Waits for Postgres, applies the Drizzle schema migrations + SQL
# functions + triggers + seed data, then starts NestJS.
# No GoTrue / no Supabase Storage — auth is local, storage is MinIO
# (buckets are created by StorageService on boot).
# ============================================================

log()  { echo "[entrypoint] $*"; }
warn() { echo "[entrypoint] WARN: $*" >&2; }

wait_for_tcp() {
  host="$1"; port="$2"; label="$3"; max="${4:-60}"; n=0
  log "Waiting for $label ($host:$port)..."
  while ! nc -z "$host" "$port" 2>/dev/null; do
    n=$((n + 1))
    [ "$n" -ge "$max" ] && { warn "$label not reachable after ${max}s — continuing"; return 1; }
    sleep 1
  done
  log "$label is reachable."
}

# ── Wait for Postgres ──────────────────────────────────────
if [ -n "$DATABASE_URL" ]; then
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  DB_PORT="${DB_PORT:-5432}"
  wait_for_tcp "$DB_HOST" "$DB_PORT" "PostgreSQL" 60
fi

# ── Apply migrations + seeds (idempotent, version-tracked) ──
apply_dir() {
  dir="$1"
  [ -d "$dir" ] || return 0
  for file in $(ls "$dir"/*.sql 2>/dev/null | sort); do
    version=$(basename "$file")
    applied=$(psql "$DATABASE_URL" -tAq -c \
      "SELECT 1 FROM public._drizzle_applied WHERE version = '$version' LIMIT 1;" 2>/dev/null || echo "")
    [ "$applied" = "1" ] && { SKIPPED=$((SKIPPED + 1)); continue; }
    log "  Applying: $version"
    if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$file"; then
      psql "$DATABASE_URL" -q -c \
        "INSERT INTO public._drizzle_applied (version) VALUES ('$version') ON CONFLICT DO NOTHING;" 2>/dev/null
      APPLIED=$((APPLIED + 1))
    else
      warn "  FAILED: $version (see errors above)"
    fi
  done
}

if [ -n "$DATABASE_URL" ]; then
  log "Ensuring extensions + migration tracking..."
  psql "$DATABASE_URL" -q -c "
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS public._drizzle_applied (
      version text PRIMARY KEY,
      applied_at timestamptz DEFAULT now()
    );
  " 2>/dev/null || warn "Could not ensure extensions/tracking table"

  APPLIED=0; SKIPPED=0
  log "Applying schema migrations (drizzle/)..."
  apply_dir "./drizzle"        # 0000 baseline, 0001 functions, 0002 auth, 0003 realtime
  log "Applying seed data (drizzle/seed/)..."
  apply_dir "./drizzle/seed"   # integration defs, default boards, backbone defs, comm sources
  log "Migrations complete: $APPLIED applied, $SKIPPED already up-to-date."
else
  log "Skipping migrations (DATABASE_URL not set)."
fi

# MinIO buckets are created by StorageService.onModuleInit — nothing to do here.

log "Starting TaskClaw backend..."
exec "$@"
