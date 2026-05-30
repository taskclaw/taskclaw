#!/usr/bin/env bash
# ============================================================
# TaskClaw — One-Line Installer
# ============================================================
# Local (zero-config, localhost:3000):
#   curl -fsSL https://raw.githubusercontent.com/taskclaw/taskclaw/main/scripts/install.sh | sh
#
# Or download and run manually:
#   wget -qO install.sh https://raw.githubusercontent.com/taskclaw/taskclaw/main/scripts/install.sh
#   chmod +x install.sh && ./install.sh
#
# Remote / production (server mode) — set a non-localhost URL or host:
#   TASKCLAW_SITE_URL=https://taskclaw.example.com ./install.sh
#   TASKCLAW_SITE_URL=http://203.0.113.10:3000     ./install.sh
#   TASKCLAW_HOST=203.0.113.10                      ./install.sh   # -> http://203.0.113.10:3000
#
# Server mode additionally: installs Docker if missing, generates
# unique secrets into a persistent .env, opens the firewall, activates
# the seeded super admin, and writes a chmod-600 credentials file.
# Run it locally against a box with:  npx taskclaw remote --host <ip> ...
# ============================================================
set -euo pipefail

REPO_REF="${TASKCLAW_REPO_REF:-main}"
REPO_URL="https://raw.githubusercontent.com/taskclaw/taskclaw/${REPO_REF}"
INSTALL_DIR="${TASKCLAW_DIR:-$HOME/taskclaw}"

# ── Colors ──────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[taskclaw]${NC} $*"; }
ok()    { echo -e "${GREEN}[taskclaw]${NC} $*"; }
warn()  { echo -e "${YELLOW}[taskclaw]${NC} $*"; }
err()   { echo -e "${RED}[taskclaw]${NC} $*" >&2; }

# ── Mode detection ─────────────────────────────────────────
# Server mode is triggered when the operator points TaskClaw at a
# non-localhost URL or host. Anything localhost / 127.0.0.1 / unset
# keeps the original zero-config localhost behaviour untouched.

TASKCLAW_SITE_URL="${TASKCLAW_SITE_URL:-}"
TASKCLAW_HOST="${TASKCLAW_HOST:-}"
TASKCLAW_PORT="${TASKCLAW_PORT:-3000}"

# Derive a SITE_URL from TASKCLAW_HOST if only the host was given.
if [ -z "$TASKCLAW_SITE_URL" ] && [ -n "$TASKCLAW_HOST" ]; then
  TASKCLAW_SITE_URL="http://${TASKCLAW_HOST}:${TASKCLAW_PORT}"
fi

is_localhost_url() {
  # Returns 0 (true) for empty/localhost/127.0.0.1/0.0.0.0 URLs.
  case "$1" in
    ""|*localhost*|*127.0.0.1*|*0.0.0.0*) return 0 ;;
    *) return 1 ;;
  esac
}

SERVER_MODE=0
if ! is_localhost_url "$TASKCLAW_SITE_URL"; then
  SERVER_MODE=1
fi

# The effective public URL of the deployment (used by both modes for the
# health check and final banner). Defaults to localhost:3000.
SITE_URL="${TASKCLAW_SITE_URL:-http://localhost:${TASKCLAW_PORT}}"

# ============================================================
# Shared helpers
# ============================================================

# fetch <remote-path> <dest> — download a repo file via curl or wget.
fetch() {
  local src="$REPO_URL/$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$src" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$dest" "$src"
  else
    err "Neither curl nor wget found. Please install one and try again."
    exit 1
  fi
}

download_files() {
  info "Setting up in: $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"

  info "Downloading docker-compose.quickstart.yml..."
  fetch "docker-compose.quickstart.yml" "$INSTALL_DIR/docker-compose.yml"

  mkdir -p "$INSTALL_DIR/docker/volumes/api"
  mkdir -p "$INSTALL_DIR/docker/volumes/db"
  for file in docker/volumes/api/kong.quickstart.yml docker/volumes/db/roles.sql docker/volumes/db/jwt.sql; do
    fetch "$file" "$INSTALL_DIR/$file"
  done

  # The Supabase containers (Kong, etc.) run as NON-root users and bind-mount
  # these config files read-only. A hardened host (root umask 077) would leave
  # them mode 600, so the container can't read them -> "kong.yml: Permission
  # denied". Force world-read + dir-traverse so any container UID can read them.
  chmod -R a+rX "$INSTALL_DIR/docker"

  ok "Files downloaded."
}

# Poll <url>/api/health (and a localhost fallback) until healthy or timeout.
# Sets the global HEALTHY=1 on success.
HEALTHY=0
wait_for_health() {
  local base="$1"
  info "Waiting for services to start (this takes 30-60 seconds)..."
  local attempts=0 max_attempts=60
  while [ $attempts -lt $max_attempts ]; do
    if curl -sf "${base}/api/health" >/dev/null 2>&1; then
      HEALTHY=1; return 0
    fi
    # Fallback: the gateway is always reachable on localhost:PORT on the box itself.
    if curl -sf "http://localhost:${TASKCLAW_PORT}/api/health" >/dev/null 2>&1; then
      HEALTHY=1; return 0
    fi
    attempts=$((attempts + 1))
    sleep 2
  done
  return 1
}

# ── DB bootstrap (idempotent) ───────────────────────────────
# The supabase/postgres image's init-scripts (roles.sql/jwt.sql) don't reliably
# apply across image versions / bind-mount handling, and the base image
# pre-creates the auth.* objects owned by supabase_admin. So run an explicit
# bootstrap against a freshly-up db BEFORE auth/rest/storage/realtime migrate:
#   1) set the internal Supabase roles' passwords == POSTGRES_PASSWORD (so
#      rest/auth/storage/realtime can authenticate),
#   2) give supabase_auth_admin OWNERSHIP of the auth schema + its objects, so
#      GoTrue's CREATE OR REPLACE FUNCTION auth.uid()/role() succeeds instead of
#      failing with "must be owner of function uid" (SQLSTATE 42501), and
#   3) ensure the realtime schema exists, so realtime's migrate doesn't abort
#      with "no schema has been selected to create in" (SQLSTATE 3F000).
bootstrap_db() {
  info "Bootstrapping database (roles, ownership, schemas)..."
  local pgpw
  pgpw="$(grep '^POSTGRES_PASSWORD=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2- || true)"
  [ -n "$pgpw" ] || pgpw="postgres"

  # Bring up ONLY the db first, then wait until it accepts connections.
  docker compose up -d --pull missing db
  local attempts=0
  until docker compose exec -T db pg_isready -U postgres -h localhost >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    [ $attempts -ge 60 ] && { warn "db did not become ready in time; continuing."; break; }
    sleep 2
  done
  # Let the base image's own init (which creates auth.* + the supabase roles)
  # settle after the port opens.
  sleep 3

  docker compose exec -T db \
    psql -U postgres -d postgres -v ON_ERROR_STOP=0 -v pw="$pgpw" >/dev/null 2>&1 <<'SQL' || \
    warn "db bootstrap reported issues (continuing; it may already be applied)."
ALTER USER postgres               WITH PASSWORD :'pw';
ALTER USER authenticator          WITH PASSWORD :'pw';
ALTER USER supabase_auth_admin    WITH PASSWORD :'pw';
ALTER USER supabase_storage_admin WITH PASSWORD :'pw';
ALTER USER supabase_admin         WITH PASSWORD :'pw';
CREATE SCHEMA IF NOT EXISTS realtime  AUTHORIZATION supabase_admin;
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='auth') THEN
    EXECUTE 'ALTER SCHEMA auth OWNER TO supabase_auth_admin';
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='auth' LOOP
      EXECUTE format('ALTER TABLE auth.%I OWNER TO supabase_auth_admin', r.tablename);
    END LOOP;
    FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname='auth' LOOP
      EXECUTE format('ALTER SEQUENCE auth.%I OWNER TO supabase_auth_admin', r.sequencename);
    END LOOP;
    FOR r IN SELECT format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
             FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' LOOP
      EXECUTE format('ALTER FUNCTION auth.%s OWNER TO supabase_auth_admin', r.sig);
    END LOOP;
  END IF;
END $$;
SQL
  ok "Database bootstrapped."
}

# ============================================================
# SERVER MODE
# ============================================================
run_server_mode() {
  info "Server mode — deploying TaskClaw at: ${SITE_URL}"

  # ── 1. Install Docker + compose if missing ──────────────────
  ensure_docker

  # ── 2/3. Generate secrets + write .env (idempotent) ─────────
  ensure_env

  # ── 4. Download config, pull, start ─────────────────────────
  download_files
  cd "$INSTALL_DIR"

  # Bootstrap the DB (roles, auth-schema ownership, realtime schema) on a
  # db-only bring-up BEFORE the dependent services migrate.
  bootstrap_db

  info "Starting TaskClaw (pulling any missing images, this may take a few minutes)..."
  # --pull missing: fetch images that aren't present, but DON'T clobber a
  # locally-built/preloaded image (e.g. a from-source build of the frontend).
  docker compose up -d --pull missing

  # ── 5. Open the firewall for the single exposed port ────────
  open_firewall "$TASKCLAW_PORT"

  # ── 6. Health poll + activate seeded super admin ────────────
  if wait_for_health "$SITE_URL"; then
    activate_super_admin
  fi

  # ── 7. Write credentials file + final banner ────────────────
  write_credentials
  print_server_banner
}

# ── Docker install (idempotent) ─────────────────────────────
ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker $(docker --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) already installed."
    return 0
  fi

  info "Docker not found — installing..."

  # Prefer the official convenience script.
  if command -v curl >/dev/null 2>&1 && curl -fsSL https://get.docker.com | sh; then
    ok "Docker installed via get.docker.com."
  else
    warn "get.docker.com failed — falling back to distro packages."
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -y || true
      apt-get install -y docker.io docker-compose-v2 docker-buildx || \
        apt-get install -y docker.io docker-compose docker-buildx || true
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y docker docker-compose-plugin docker-buildx-plugin || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y docker docker-compose-plugin docker-buildx-plugin || true
    else
      err "Could not auto-install Docker on this distro. Install Docker + compose v2 manually:"
      err "  https://docs.docker.com/engine/install/"
      exit 1
    fi
  fi

  # Enable + start the daemon (no-op on systems without systemd).
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable --now docker >/dev/null 2>&1 || true
  fi

  if ! command -v docker >/dev/null 2>&1; then
    err "Docker still not available after install. Aborting."
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    err "Docker Compose v2 plugin not available after install. Aborting."
    err "Install it: https://docs.docker.com/compose/install/"
    exit 1
  fi
  ok "Docker $(docker --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) ready."
}

# ── JWT signer (HS256 Supabase JWTs) ────────────────────────
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
sign_jwt() { # $1=role $2=secret
  local h p s
  h=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)
  p=$(printf '%s' "{\"role\":\"$1\",\"iss\":\"supabase\",\"iat\":1700000000,\"exp\":2000000000}" | b64url)
  s=$(printf '%s' "$h.$p" | openssl dgst -sha256 -hmac "$2" -binary | b64url)
  printf '%s.%s.%s' "$h" "$p" "$s"
}

# ── Secret generation + .env (idempotent) ───────────────────
# Re-runs reuse the existing .env so secrets stay stable across upgrades.
ensure_env() {
  local env_file="$INSTALL_DIR/.env"
  mkdir -p "$INSTALL_DIR"

  if [ -f "$env_file" ]; then
    ok "Reusing existing secrets in $env_file (idempotent re-run)."
    return 0
  fi

  if ! command -v openssl >/dev/null 2>&1; then
    err "openssl is required to generate secrets but was not found."
    err "Install it (e.g. 'apt-get install -y openssl') and re-run."
    exit 1
  fi

  info "Generating unique secrets..."
  local POSTGRES_PASSWORD ENCRYPTION_KEY JWT_SECRET REALTIME_SECRET_KEY_BASE ANON_KEY SERVICE_ROLE_KEY COOKIE_SECURE
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  ENCRYPTION_KEY="$(openssl rand -hex 32)"
  JWT_SECRET="$(openssl rand -hex 32)"
  REALTIME_SECRET_KEY_BASE="$(openssl rand -base64 48 | tr -d '\n')"
  ANON_KEY="$(sign_jwt anon "$JWT_SECRET")"
  SERVICE_ROLE_KEY="$(sign_jwt service_role "$JWT_SECRET")"

  # http:// site -> cookies cannot be Secure (browser would drop them).
  case "$SITE_URL" in
    https://*) COOKIE_SECURE="true" ;;
    *)         COOKIE_SECURE="false" ;;
  esac

  # docker compose auto-loads a .env file sitting next to the compose file.
  umask 077
  cat > "$env_file" <<EOF
# TaskClaw — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Auto-loaded by docker compose. Keep this file private (chmod 600).
SITE_URL=${SITE_URL}
COOKIE_SECURE=${COOKIE_SECURE}
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
REALTIME_SECRET_KEY_BASE=${REALTIME_SECRET_KEY_BASE}
EOF
  chmod 600 "$env_file" 2>/dev/null || true
  ok "Wrote $env_file with unique secrets."
}

# ── Firewall (single port) ──────────────────────────────────
open_firewall() {
  local port="$1"
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi "Status: active"; then
    info "Opening firewall (ufw) for port ${port}..."
    ufw allow "${port}" >/dev/null 2>&1 || ufw allow "${port}/tcp" >/dev/null 2>&1 || true
    ok "ufw: port ${port} allowed."
  else
    info "No active ufw firewall detected — skipping (no-op)."
    warn "If your provider has a cloud firewall (e.g. Hetzner Cloud, AWS"
    warn "security groups, DigitalOcean), open TCP ${port} there too."
  fi
}

# ── Activate the seeded super admin (make login actually work) ──
# The backend seed inserts the super-admin auth user by hand, which leaves two
# quirks that block password login until repaired here — so do it deterministically
# once the stack is healthy:
#   • the row's `aud` is 'authenticated', but this GoTrue version looks users up
#     with an EMPTY audience on a password grant, so the email never matches —
#     set aud='' so it does;
#   • (re)set a known bcrypt password + confirm the email, so the credentials we
#     report are guaranteed to work regardless of the seed's stored hash.
# Also flips the app-level approval gate (public.users.status) to 'active', and
# captures the REAL admin email (the seed may rename it) for the banner + creds.
# Override the password by putting SUPER_ADMIN_PASSWORD=... in the .env.
SUPER_ADMIN_EMAIL=""
SUPER_ADMIN_PASSWORD=""
activate_super_admin() {
  info "Ensuring the seeded super admin can log in..."
  # NOTE: trailing `|| true` is load-bearing — the script runs under
  # `set -euo pipefail`, so a grep that finds nothing (SUPER_ADMIN_PASSWORD is
  # optional and usually absent) would otherwise abort the whole install here.
  SUPER_ADMIN_PASSWORD="$(grep -E '^SUPER_ADMIN_PASSWORD=' "$INSTALL_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  [ -n "$SUPER_ADMIN_PASSWORD" ] || SUPER_ADMIN_PASSWORD="password123"

  SUPER_ADMIN_EMAIL="$(docker compose exec -T db psql -U postgres -d postgres -tAc \
    "SELECT email FROM auth.users ORDER BY created_at ASC LIMIT 1" </dev/null 2>/dev/null | tr -d '[:space:]' || true)"

  # NB: the SQL is fed on STDIN (heredoc), not via `psql -c`, because psql only
  # interpolates :'pw' variables for stdin/file input — never for -c strings.
  if docker compose exec -T db psql -U postgres -d postgres \
       -v ON_ERROR_STOP=1 -v pw="$SUPER_ADMIN_PASSWORD" >/dev/null 2>&1 <<'SQL'
UPDATE auth.users
   SET aud = '',
       encrypted_password = crypt(:'pw', gen_salt('bf')),
       email_confirmed_at = COALESCE(email_confirmed_at, now()),
       confirmation_token = '', recovery_token = ''
 WHERE id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1);
UPDATE public.users SET status = 'active' WHERE status IS DISTINCT FROM 'active';
SQL
  then
    ok "Super admin ready: ${SUPER_ADMIN_EMAIL:-super@admin.com} / ${SUPER_ADMIN_PASSWORD}"
  else
    warn "Could not finalize the super admin automatically (table may not exist yet)."
    warn "If login fails, see: cd $INSTALL_DIR && docker compose logs auth"
  fi
}

# ── Credentials file ────────────────────────────────────────
write_credentials() {
  local creds="$INSTALL_DIR/taskclaw-credentials.json"
  local env_file="$INSTALL_DIR/.env"

  # Pull the secrets back out of .env so re-runs report the persisted values.
  local JWT_SECRET="" ANON_KEY="" SERVICE_ROLE_KEY="" POSTGRES_PASSWORD="" ENCRYPTION_KEY=""
  if [ -f "$env_file" ]; then
    JWT_SECRET="$(grep -E '^JWT_SECRET=' "$env_file" | head -1 | cut -d= -f2-)"
    ANON_KEY="$(grep -E '^ANON_KEY=' "$env_file" | head -1 | cut -d= -f2-)"
    SERVICE_ROLE_KEY="$(grep -E '^SERVICE_ROLE_KEY=' "$env_file" | head -1 | cut -d= -f2-)"
    POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "$env_file" | head -1 | cut -d= -f2-)"
    ENCRYPTION_KEY="$(grep -E '^ENCRYPTION_KEY=' "$env_file" | head -1 | cut -d= -f2-)"
  fi

  umask 077
  cat > "$creds" <<EOF
{
  "url": "${SITE_URL}",
  "admin": {
    "email": "${SUPER_ADMIN_EMAIL:-super@admin.com}",
    "password": "${SUPER_ADMIN_PASSWORD:-password123}"
  },
  "secrets": {
    "jwt_secret": "${JWT_SECRET}",
    "anon_key": "${ANON_KEY}",
    "service_role_key": "${SERVICE_ROLE_KEY}",
    "postgres_password": "${POSTGRES_PASSWORD}",
    "encryption_key": "${ENCRYPTION_KEY}"
  }
}
EOF
  chmod 600 "$creds" 2>/dev/null || true
  ok "Wrote credentials to $creds (chmod 600)."
}

print_server_banner() {
  echo ""
  if [ "$HEALTHY" -eq 1 ]; then
    echo -e "${GREEN}  ══════════════════════════════════════════${NC}"
    echo -e "${GREEN}  TaskClaw is ready!${NC}"
    echo -e "${GREEN}  ══════════════════════════════════════════${NC}"
  else
    warn "Services are still starting up (health check timed out)."
    warn "Check status with: cd $INSTALL_DIR && docker compose ps"
    warn "View logs with:    cd $INSTALL_DIR && docker compose logs -f"
    echo ""
  fi
  echo ""
  echo -e "  URL:        ${CYAN}${SITE_URL}${NC}"
  echo -e "  Email:      ${CYAN}${SUPER_ADMIN_EMAIL:-super@admin.com}${NC}"
  echo -e "  Password:   ${CYAN}${SUPER_ADMIN_PASSWORD:-password123}${NC}"
  echo -e "  Secrets:    ${CYAN}$INSTALL_DIR/taskclaw-credentials.json${NC}"
  echo ""
  case "$SITE_URL" in
    https://*) ;;
    *) warn "Running over plain HTTP. For production, put TaskClaw behind a"
       warn "domain with TLS (set TASKCLAW_SITE_URL=https://your-domain)." ;;
  esac
  echo ""
  info "Useful commands (on the server):"
  echo "  cd $INSTALL_DIR"
  echo "  docker compose ps          # Check status"
  echo "  docker compose logs -f     # View logs"
  echo "  docker compose down        # Stop"
  echo "  docker compose down -v     # Stop + delete data"
  echo ""
}

# ============================================================
# LOCALHOST MODE (original zero-config behaviour, unchanged)
# ============================================================
run_localhost_mode() {
  # ── Check prerequisites ────────────────────────────────────
  info "Checking prerequisites..."

  if ! command -v docker >/dev/null 2>&1; then
    err "Docker is required but not found."
    err "Install it from https://docs.docker.com/get-docker/"
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    err "Docker Compose v2 is required but not found."
    err "It's included with Docker Desktop, or install the plugin:"
    err "  https://docs.docker.com/compose/install/"
    exit 1
  fi

  ok "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
  ok "Docker Compose $(docker compose version --short)"

  # ── Download compose + config files ───────────────────────
  download_files

  # ── Pull and start ─────────────────────────────────────────
  cd "$INSTALL_DIR"

  # Bootstrap the DB (roles, auth-schema ownership, realtime schema) on a
  # db-only bring-up BEFORE the dependent services migrate.
  bootstrap_db

  info "Starting TaskClaw (pulling any missing images, this may take a few minutes)..."
  # --pull missing: fetch images that aren't present, but DON'T clobber a
  # locally-built/preloaded image (e.g. a from-source build of the frontend).
  docker compose up -d --pull missing

  # ── Wait for startup ───────────────────────────────────────
  wait_for_health "http://localhost:${TASKCLAW_PORT}" || true

  # Repair the seeded super admin so login works (aud='' + known password); also
  # captures the real admin email. Harmless if the stack isn't fully up yet.
  [ "$HEALTHY" -eq 1 ] && activate_super_admin || true

  echo ""
  if [ "$HEALTHY" -eq 1 ]; then
    echo -e "${GREEN}  ══════════════════════════════════════════${NC}"
    echo -e "${GREEN}  TaskClaw is ready!${NC}"
    echo -e "${GREEN}  ══════════════════════════════════════════${NC}"
    echo ""
    echo -e "  URL:      ${CYAN}http://localhost:${TASKCLAW_PORT}${NC}"
    echo -e "  Email:    ${CYAN}${SUPER_ADMIN_EMAIL:-super@admin.com}${NC}"
    echo -e "  Password: ${CYAN}${SUPER_ADMIN_PASSWORD:-password123}${NC}"
    echo ""
    echo -e "${GREEN}  ══════════════════════════════════════════${NC}"
  else
    warn "Services are still starting up."
    warn "Check status with: cd $INSTALL_DIR && docker compose ps"
    warn "View logs with:    cd $INSTALL_DIR && docker compose logs -f"
    echo ""
    echo "  Once ready, open: http://localhost:${TASKCLAW_PORT}"
    echo "  Login: ${SUPER_ADMIN_EMAIL:-super@admin.com} / ${SUPER_ADMIN_PASSWORD:-password123}"
  fi

  echo ""
  info "Useful commands:"
  echo "  cd $INSTALL_DIR"
  echo "  docker compose ps          # Check status"
  echo "  docker compose logs -f     # View logs"
  echo "  docker compose down        # Stop"
  echo "  docker compose down -v     # Stop + delete data"
  echo ""
}

# ============================================================
# Dispatch
# ============================================================
if [ "$SERVER_MODE" -eq 1 ]; then
  run_server_mode
else
  run_localhost_mode
fi
