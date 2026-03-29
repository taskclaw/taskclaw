#!/bin/sh
set -e

# ============================================================
# TaskClaw Backend — Docker Entrypoint
# ============================================================
# Waits for dependencies, runs migrations, initializes storage,
# then starts the NestJS application.
# ============================================================

# ── Helpers ─────────────────────────────────────────────────

log()  { echo "[entrypoint] $*"; }
warn() { echo "[entrypoint] WARN: $*" >&2; }

wait_for_tcp() {
  local host="$1" port="$2" label="$3" max_attempts="${4:-30}"
  local attempt=0
  log "Waiting for $label ($host:$port)..."
  while ! nc -z "$host" "$port" 2>/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max_attempts" ]; then
      warn "$label not reachable after ${max_attempts}s — continuing anyway"
      return 1
    fi
    sleep 1
  done
  log "$label is reachable."
}

wait_for_http() {
  local url="$1" label="$2" max_attempts="${3:-60}"
  local attempt=0
  log "Waiting for $label ($url)..."
  while ! wget -q --spider "$url" 2>/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max_attempts" ]; then
      warn "$label not healthy after ${max_attempts}s — continuing anyway"
      return 1
    fi
    sleep 1
  done
  log "$label is healthy."
}

# ── Wait for dependencies ──────────────────────────────────

if [ -n "$DATABASE_URL" ]; then
  # Extract host and port from DATABASE_URL
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  DB_PORT="${DB_PORT:-5432}"
  wait_for_tcp "$DB_HOST" "$DB_PORT" "PostgreSQL" 60
fi

# Wait for GoTrue (auth) — needed because migrations reference auth schema
if [ -n "$GOTRUE_URL" ]; then
  wait_for_http "${GOTRUE_URL}/health" "GoTrue (Auth)" 60
fi

# ── Run migrations ─────────────────────────────────────────

if [ -n "$DATABASE_URL" ] && [ -d "./supabase/migrations" ]; then
  log "Running database migrations..."

  # Ensure the migration tracking schema and table exist
  psql "$DATABASE_URL" -q -c "
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      statements text[],
      name text
    );
  " 2>/dev/null || warn "Could not create migration tracking table"

  # Count total and applied migrations
  TOTAL_MIGRATIONS=$(ls ./supabase/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
  APPLIED=0
  SKIPPED=0

  for file in $(ls ./supabase/migrations/*.sql 2>/dev/null | sort); do
    filename=$(basename "$file")
    # Extract version (timestamp prefix) and name from filename
    # Format: 20240101000000_consolidated_schema.sql
    version=$(echo "$filename" | sed 's/_.*$//')
    name=$(echo "$filename" | sed 's/^[0-9]*_//' | sed 's/\.sql$//')

    # Check if already applied
    already_applied=$(psql "$DATABASE_URL" -tAq -c "
      SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '$version' LIMIT 1;
    " 2>/dev/null || echo "")

    if [ "$already_applied" = "1" ]; then
      SKIPPED=$((SKIPPED + 1))
      continue
    fi

    log "  Applying: $filename"
    if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"; then
      # Record the migration
      psql "$DATABASE_URL" -q -c "
        INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
        VALUES ('$version', '{}', '$name')
        ON CONFLICT (version) DO NOTHING;
      " 2>/dev/null
      APPLIED=$((APPLIED + 1))
    else
      warn "  FAILED: $filename (check errors above)"
    fi
  done

  log "Migrations complete: $APPLIED applied, $SKIPPED already up-to-date (of $TOTAL_MIGRATIONS total)"
else
  log "Skipping migrations (DATABASE_URL not set or no migration files found)"
fi

# ── Initialize storage buckets ─────────────────────────────

if [ -n "$STORAGE_URL" ] && [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && [ -n "$SUPABASE_ANON_KEY" ]; then
  log "Ensuring storage buckets exist..."

  for bucket in knowledge-attachments skill-attachments; do
    wget -q -O /dev/null --post-data="{\"id\":\"$bucket\",\"name\":\"$bucket\",\"public\":true}" \
      --header="Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      --header="apikey: $SUPABASE_ANON_KEY" \
      --header="Content-Type: application/json" \
      "${STORAGE_URL}/bucket" 2>/dev/null || true
  done

  log "Storage buckets ready."
fi

# ── Print startup banner ───────────────────────────────────

if [ -n "$QUICKSTART" ]; then
  echo ""
  echo "  =================================================="
  echo "  TaskClaw is starting!"
  echo "  =================================================="
  echo "  URL:      http://localhost:${EXTERNAL_PORT:-3000}"
  echo "  Email:    super@admin.com"
  echo "  Password: password123"
  echo "  =================================================="
  echo ""
fi

# ── Start the application ──────────────────────────────────

log "Starting TaskClaw backend..."
exec "$@"
