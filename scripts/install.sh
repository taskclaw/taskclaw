#!/usr/bin/env bash
# ============================================================
# TaskClaw — One-Line Installer
# ============================================================
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/DevOtts/taskclaw/main/scripts/install.sh | sh
#
# Or download and run manually:
#   wget -qO install.sh https://raw.githubusercontent.com/DevOtts/taskclaw/main/scripts/install.sh
#   chmod +x install.sh && ./install.sh
# ============================================================
set -euo pipefail

REPO_URL="https://raw.githubusercontent.com/DevOtts/taskclaw/main"
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

# ── Download compose file ──────────────────────────────────

info "Setting up in: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

info "Downloading docker-compose.quickstart.yml..."

# Download compose file
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$REPO_URL/docker-compose.quickstart.yml" -o "$INSTALL_DIR/docker-compose.yml"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$INSTALL_DIR/docker-compose.yml" "$REPO_URL/docker-compose.quickstart.yml"
else
  err "Neither curl nor wget found. Please install one and try again."
  exit 1
fi

# Download required config files
mkdir -p "$INSTALL_DIR/docker/volumes/api"
mkdir -p "$INSTALL_DIR/docker/volumes/db"

for file in docker/volumes/api/kong.quickstart.yml docker/volumes/db/roles.sql docker/volumes/db/jwt.sql; do
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$REPO_URL/$file" -o "$INSTALL_DIR/$file"
  else
    wget -qO "$INSTALL_DIR/$file" "$REPO_URL/$file"
  fi
done

ok "Files downloaded."

# ── Pull and start ─────────────────────────────────────────

cd "$INSTALL_DIR"

info "Pulling Docker images (this may take a few minutes)..."
docker compose pull

info "Starting TaskClaw..."
docker compose up -d

# ── Wait for startup ───────────────────────────────────────

info "Waiting for services to start (this takes 30-60 seconds)..."

attempts=0
max_attempts=60
while [ $attempts -lt $max_attempts ]; do
  if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
    break
  fi
  attempts=$((attempts + 1))
  sleep 2
done

echo ""
if [ $attempts -lt $max_attempts ]; then
  echo -e "${GREEN}  ══════════════════════════════════════════${NC}"
  echo -e "${GREEN}  TaskClaw is ready!${NC}"
  echo -e "${GREEN}  ══════════════════════════════════════════${NC}"
  echo ""
  echo -e "  URL:      ${CYAN}http://localhost:3000${NC}"
  echo -e "  Email:    ${CYAN}super@admin.com${NC}"
  echo -e "  Password: ${CYAN}password123${NC}"
  echo ""
  echo -e "${GREEN}  ══════════════════════════════════════════${NC}"
else
  warn "Services are still starting up."
  warn "Check status with: cd $INSTALL_DIR && docker compose ps"
  warn "View logs with:    cd $INSTALL_DIR && docker compose logs -f"
  echo ""
  echo "  Once ready, open: http://localhost:3000"
  echo "  Login: super@admin.com / password123"
fi

echo ""
info "Useful commands:"
echo "  cd $INSTALL_DIR"
echo "  docker compose ps          # Check status"
echo "  docker compose logs -f     # View logs"
echo "  docker compose down        # Stop"
echo "  docker compose down -v     # Stop + delete data"
echo ""
