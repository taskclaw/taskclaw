#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# TaskClaw — Test Data Reset Script
#
# Clears all transient data (messages, tasks, orchestrations, executions, etc.)
# while preserving structure (boards, agents, pods, skills, backbone configs,
# integration connections, sources, subscriptions).
#
# Also flushes Redis and all BullMQ queues.
#
# ── How clearing works ────────────────────────────────────────────────────────
#
# Step 2 uses TRUNCATE for speed. However:
#   • TRUNCATE does NOT fire Postgres row-level events, so Supabase Realtime
#     subscribers (e.g. the cockpit "Running Now" panel, which reads
#     orchestrated_tasks) will NOT update live — a browser refresh is needed.
#   • Workers that already dequeued a BullMQ job before Redis was flushed may
#     still write to the DB after the TRUNCATE completes.
#
# Step 2.5 waits 3s for in-flight workers to finish, then runs a second-pass
# DELETE (not TRUNCATE) on the most likely re-inserted tables. DELETE fires
# Realtime events, so the cockpit clears without a browser refresh.
#
# Usage:
#   ./scripts/reset-test-data.sh          # interactive (asks for confirmation)
#   ./scripts/reset-test-data.sh --yes    # skip confirmation
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

YELLOW='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

DB_CONTAINER="taskclaw-db-1"
REDIS_CONTAINER="taskclaw-redis-1"

echo ""
echo -e "${BOLD}${CYAN}TaskClaw — Test Data Reset${NC}"
echo -e "${CYAN}────────────────────────────────────────${NC}"
echo ""
echo -e "This will ${RED}permanently delete${NC}:"
echo "  • All tasks and task dependencies"
echo "  • All conversations and messages"
echo "  • All orchestrations and DAG data"
echo "  • All execution logs and agent activity"
echo "  • All agent memories and approvals"
echo "  • All AI conversations and messages"
echo "  • All sync jobs and card executions"
echo "  • All semaphore leases and circuit breaker states"
echo "  • All webhook delivery history"
echo "  • All plans"
echo ""
echo -e "This will ${GREEN}preserve${NC}:"
echo "  • Boards, board steps, board templates, board routes"
echo "  • Agents and agent skills / categories"
echo "  • Pods and pod config"
echo "  • Knowledge docs"
echo "  • Backbone connections and definitions"
echo "  • AI provider configs"
echo "  • Integration connections and sources"
echo "  • Webhooks (definitions only)"
echo "  • Heartbeat configs"
echo "  • Accounts, users, and team memberships"
echo ""

# ── Confirmation ──────────────────────────────────────────────────────────────

if [[ "${1:-}" != "--yes" ]]; then
  echo -ne "${YELLOW}Are you sure you want to reset all test data? [y/N]${NC} "
  read -r confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo ""
echo -e "${CYAN}Resetting...${NC}"

# ── Step 1: Flush Redis + BullMQ queues ───────────────────────────────────────
# Done first so no new jobs are enqueued after the DB is cleared.
# Note: workers that already dequeued a job before this flush may still
# complete and write to the DB — the second pass in step 2.5 catches those.

echo -n "  [1/4] Flushing Redis (all keys)... "
docker exec "$REDIS_CONTAINER" redis-cli FLUSHALL > /dev/null 2>&1
echo -e "${GREEN}done${NC}"

# ── Step 2: Clear DB in FK-safe order (TRUNCATE for speed) ───────────────────
# Uses individual -c flags (not a heredoc) — heredoc stdin is not reliably
# passed through docker exec in all shell environments.

echo -n "  [2/4] Clearing database tables... "

docker exec "$DB_CONTAINER" psql -U postgres -d postgres -q -c "
  -- NULL out nullable FK columns before truncating referenced tables.
  UPDATE integration_connections SET test_conversation_id = NULL WHERE test_conversation_id IS NOT NULL;

  -- Temporarily drop the FK constraint from integration_connections → conversations.
  -- This is the only FK from a preserved table into a transient table.
  -- We re-add it at the end of this block.
  ALTER TABLE integration_connections
    DROP CONSTRAINT IF EXISTS integration_connections_test_conversation_id_fkey;

  -- Truncate all transient tables in one statement.
  -- Postgres resolves FK order automatically within a single TRUNCATE.
  TRUNCATE TABLE
    semaphore_leases, circuit_breaker_states,
    agent_approval_requests, orchestrated_task_deps, dag_approvals,
    orchestrated_tasks, task_dags,
    execution_log, agent_activity, agent_sync_logs,
    card_executions, webhook_deliveries,
    agent_memories, memory_connections, sync_jobs,
    ai_messages, ai_conversations,
    subscriptions, plans,
    messages, conversations,
    task_dependencies, tasks;

  -- Restore the FK constraint.
  ALTER TABLE integration_connections
    ADD CONSTRAINT integration_connections_test_conversation_id_fkey
    FOREIGN KEY (test_conversation_id) REFERENCES conversations(id);"

echo -e "${GREEN}done${NC}"

# ── Step 2.5: Second-pass DELETE — catch in-flight stragglers + fire Realtime ─
# TRUNCATE bypasses Postgres triggers, so Supabase Realtime subscribers never
# receive a notification. The cockpit "Running Now" panel (orchestrated_tasks)
# and "24H Company Timeline" (execution_log, agent_activity) would stay stale
# until a browser refresh.
#
# Waiting 3s lets any in-flight worker finish writing, then DELETE fires
# row-level events so live UI panels clear automatically.

echo -n "  [3/4] Second-pass DELETE (fires Realtime, clears live UI)... "
sleep 3

docker exec "$DB_CONTAINER" psql -U postgres -d postgres -q \
  -c "DELETE FROM agent_approval_requests;" \
  -c "DELETE FROM orchestrated_task_deps;" \
  -c "DELETE FROM dag_approvals;" \
  -c "DELETE FROM orchestrated_tasks;" \
  -c "DELETE FROM task_dags;" \
  -c "DELETE FROM execution_log;" \
  -c "DELETE FROM agent_activity;" \
  -c "DELETE FROM sync_jobs;"

echo -e "${GREEN}done${NC}"

# ── Step 4: Verify ─────────────────────────────────────────────────────────────

echo -n "  [4/4] Verifying... "

COUNTS=$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -t -q \
  -c "SELECT
    (SELECT COUNT(*) FROM tasks)              AS tasks,
    (SELECT COUNT(*) FROM messages)           AS messages,
    (SELECT COUNT(*) FROM conversations)      AS conversations,
    (SELECT COUNT(*) FROM orchestrated_tasks) AS orchestrations,
    (SELECT COUNT(*) FROM execution_log)      AS exec_logs,
    (SELECT COUNT(*) FROM pods)               AS pods,
    (SELECT COUNT(*) FROM board_instances)    AS boards,
    (SELECT COUNT(*) FROM agents)             AS agents,
    (SELECT COUNT(*) FROM integration_connections) AS integrations,
    (SELECT COUNT(*) FROM sources)            AS sources;")

REDIS_KEYS=$(docker exec "$REDIS_CONTAINER" redis-cli DBSIZE 2>/dev/null | tr -d '[:space:]')

echo -e "${GREEN}done${NC}"

# Parse counts (output is: tasks | messages | conversations | ...)
read -r TASKS MSGS CONVS ORCHS LOGS PODS BOARDS AGENTS INTEG SRCS <<< $(echo "$COUNTS" | tr '|' ' ')

echo ""
echo -e "${GREEN}${BOLD}Reset complete!${NC}"
echo ""
echo -e "  Cleared:"
echo -e "    Tasks:          $(echo $TASKS | tr -d ' ')"
echo -e "    Messages:       $(echo $MSGS | tr -d ' ')"
echo -e "    Conversations:  $(echo $CONVS | tr -d ' ')"
echo -e "    Orchestrations: $(echo $ORCHS | tr -d ' ')"
echo -e "    Exec logs:      $(echo $LOGS | tr -d ' ')"
echo -e "    Redis keys:     $REDIS_KEYS"
echo ""
echo -e "  Preserved:"
echo -e "    Pods:           $(echo $PODS | tr -d ' ')"
echo -e "    Boards:         $(echo $BOARDS | tr -d ' ')"
echo -e "    Agents:         $(echo $AGENTS | tr -d ' ')"
echo -e "    Integrations:   $(echo $INTEG | tr -d ' ')"
echo -e "    Sources:        $(echo $SRCS | tr -d ' ')"
echo ""
echo -e "${CYAN}Note: TRUNCATE bypasses Realtime — browser refresh may be needed${NC}"
echo -e "${CYAN}      for any panels not covered by the second-pass DELETE above.${NC}"
echo ""
