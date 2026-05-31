#!/usr/bin/env bash
# ============================================================
# TaskClaw — Complete Uninstaller ("destroy")
# ============================================================
# Removes TaskClaw ENTIRELY from this machine:
#   - docker compose down -v --remove-orphans (containers + ALL named volumes)
#   - a defensive sweep of any leftover taskclaw-* containers / volumes / network
#   - the install dir (default: ~/taskclaw, or $TASKCLAW_DIR)
#   - optionally the taskclaw/frontend + taskclaw/backend images
#
# Run standalone (DESTRUCTIVE — deletes all data, no confirmation here):
#   TASKCLAW_DIR=~/taskclaw ./uninstall.sh
#   TASKCLAW_PURGE_IMAGES=1  ./uninstall.sh    # also remove the images
#
# NOTE: This script performs NO confirmation prompts of its own — the
# `npx taskclaw destroy` CLI gates it behind a double-confirmation. If you
# run it by hand, it WILL delete everything immediately. Docker itself is
# left installed. This is intentionally idempotent: it never errors when a
# container / volume / directory is already gone.
# ============================================================
set -euo pipefail

INSTALL_DIR="${TASKCLAW_DIR:-$HOME/taskclaw}"
# docker compose derives resource names from the project name. The compose file
# pins `name: taskclaw`, so volumes are taskclaw_<name> and the network is
# taskclaw_default. Containers are named taskclaw-<service>-<n>.
PROJECT="taskclaw"
PURGE_IMAGES="${TASKCLAW_PURGE_IMAGES:-0}"

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

have() { command -v "$1" >/dev/null 2>&1; }

# ── 0. Sanity ───────────────────────────────────────────────
if ! have docker; then
  warn "Docker not found — skipping container/volume/image removal."
  warn "Will still remove the install directory if it exists."
fi

info "Uninstalling TaskClaw"
info "Install dir: ${INSTALL_DIR}"
info "Purge images: $([ "$PURGE_IMAGES" = "1" ] && echo yes || echo no)"

# ── 1. compose down -v --remove-orphans (the clean path) ────
# This stops every container and deletes the named volumes (= all data).
if have docker && [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
  info "Stopping containers and deleting volumes (docker compose down -v)..."
  # cd in a subshell so a failure can't strand us elsewhere; tolerate errors.
  ( cd "$INSTALL_DIR" && docker compose down -v --remove-orphans ) \
    >/dev/null 2>&1 || warn "compose down reported an issue (continuing)."
  ok "Compose stack torn down."
else
  warn "No docker-compose.yml in $INSTALL_DIR — skipping compose down."
fi

# ── 2. Defensive sweep ──────────────────────────────────────
# In case compose state is gone (dir deleted, project renamed, etc.) remove any
# leftover taskclaw-* containers, the project's named volumes, and its network.
if have docker; then
  info "Sweeping for leftover TaskClaw containers / volumes / network..."

  # Containers whose name starts with taskclaw- (running or stopped).
  leftover_containers="$(docker ps -aq --filter "name=^${PROJECT}-" 2>/dev/null || true)"
  if [ -n "$leftover_containers" ]; then
    # shellcheck disable=SC2086
    docker rm -f $leftover_containers >/dev/null 2>&1 || true
    ok "Removed leftover containers."
  fi

  # Named volumes belonging to the project (taskclaw_db_data, etc.) plus any
  # other volume that begins with the project prefix.
  leftover_volumes="$(docker volume ls -q --filter "name=^${PROJECT}_" 2>/dev/null || true)"
  if [ -n "$leftover_volumes" ]; then
    # shellcheck disable=SC2086
    docker volume rm -f $leftover_volumes >/dev/null 2>&1 || true
    ok "Removed leftover volumes."
  fi

  # The compose-created default network.
  if docker network inspect "${PROJECT}_default" >/dev/null 2>&1; then
    docker network rm "${PROJECT}_default" >/dev/null 2>&1 || true
    ok "Removed project network."
  fi
fi

# ── 3. Delete the install directory ─────────────────────────
if [ -n "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR" ]; then
  info "Removing install directory: $INSTALL_DIR"
  rm -rf "$INSTALL_DIR" || warn "Could not fully remove $INSTALL_DIR."
  ok "Install directory removed."
else
  warn "Install directory $INSTALL_DIR not present — nothing to remove."
fi

# ── 4. Optionally purge images ──────────────────────────────
if [ "$PURGE_IMAGES" = "1" ] && have docker; then
  info "Removing TaskClaw images (ignored if in use or absent)..."
  for img in taskclaw/frontend taskclaw/backend; do
    # Remove every tag/ID for the repo; tolerate "in use" / "no such image".
    ids="$(docker images -q "$img" 2>/dev/null | sort -u || true)"
    if [ -n "$ids" ]; then
      # shellcheck disable=SC2086
      docker rmi -f $ids >/dev/null 2>&1 \
        && ok "Removed image $img." \
        || warn "Could not remove $img (in use?) — leaving it."
    else
      info "No $img image present."
    fi
  done
fi

# ── 5. Summary ──────────────────────────────────────────────
echo ""
echo -e "${GREEN}  ══════════════════════════════════════════${NC}"
echo -e "${GREEN}  TaskClaw has been completely removed.${NC}"
echo -e "${GREEN}  ══════════════════════════════════════════${NC}"
echo ""
if [ "$PURGE_IMAGES" = "1" ]; then
  echo -e "  Images:  ${CYAN}taskclaw/frontend + taskclaw/backend purged${NC}"
else
  echo -e "  Images:  ${CYAN}left on disk (re-run with TASKCLAW_PURGE_IMAGES=1 to remove)${NC}"
fi
echo -e "  Docker:  ${CYAN}left installed (uninstall it yourself if desired)${NC}"
echo ""
