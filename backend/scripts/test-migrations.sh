#!/bin/bash
set -e

echo "=== TaskClaw Migration Smoke Test ==="
DB_CMD="docker exec taskclaw-db-1 psql -U postgres -d postgres -t -c"

TABLES=("pods" "board_routes" "task_dags" "task_dependencies" "heartbeat_configs" "execution_log" "integration_tools")

PASS=0
FAIL=0

for table in "${TABLES[@]}"; do
  result=$($DB_CMD "SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = '$table');" 2>&1 | tr -d ' ')
  if [[ "$result" == *"t"* ]]; then
    echo "✓ Table '$table' exists"
    PASS=$((PASS + 1))
  else
    echo "✗ Table '$table' MISSING"
    FAIL=$((FAIL + 1))
  fi
done

# Check columns
echo ""
echo "=== Checking key columns ==="

pod_id_boards=$($DB_CMD "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name='board_instances' AND column_name='pod_id');" 2>&1 | tr -d ' ')
if [[ "$pod_id_boards" == *"t"* ]]; then
  echo "✓ board_instances.pod_id exists"
  PASS=$((PASS + 1))
else
  echo "✗ board_instances.pod_id MISSING"
  FAIL=$((FAIL + 1))
fi

tasks_dag=$($DB_CMD "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name='tasks' AND column_name='dag_id');" 2>&1 | tr -d ' ')
if [[ "$tasks_dag" == *"t"* ]]; then
  echo "✓ tasks.dag_id exists"
  PASS=$((PASS + 1))
else
  echo "✗ tasks.dag_id MISSING"
  FAIL=$((FAIL + 1))
fi

backbone_defs=$($DB_CMD "SELECT COUNT(*) FROM backbone_definitions WHERE slug IN ('anthropic','ollama');" 2>&1 | tr -d ' ')
if [[ "$backbone_defs" == *"2"* ]]; then
  echo "✓ Backbone definitions: anthropic and ollama seeded"
  PASS=$((PASS + 1))
else
  echo "✗ Backbone definitions missing (got: $backbone_defs)"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "ALL PASSED" && exit 0 || exit 1
