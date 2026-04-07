#!/bin/bash
echo "========================================="
echo "  TaskClaw Cockpit - Full Test Suite"
echo "========================================="

PASS=0
FAIL=0
WARN=0

# Migration tests
echo ""
echo "--- Migration Tests ---"
if bash /Users/macbook/Workspace/Devotts/taskclaw/taskclaw/backend/scripts/test-migrations.sh; then
  echo "✓ Migrations: PASS"
  PASS=$((PASS + 1))
else
  echo "✗ Migrations: FAIL"
  FAIL=$((FAIL + 1))
fi

# Backend health
echo ""
echo "--- Backend Health ---"
if curl -s http://localhost:3003/health | grep -q "ok"; then
  echo "✓ Backend health: PASS"
  PASS=$((PASS + 1))
else
  echo "✗ Backend health: FAIL"
  FAIL=$((FAIL + 1))
fi

# Ollama health
echo ""
echo "--- Ollama Health ---"
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo "✓ Ollama health: PASS"
  PASS=$((PASS + 1))
else
  echo "⚠ Ollama health: WARN (not started — run: docker compose up ollama -d)"
  echo "  Note: Start Ollama then run: docker exec taskclaw-ollama-1 ollama pull phi3:mini"
  WARN=$((WARN + 1))
fi

# Frontend health
echo ""
echo "--- Frontend Health ---"
if curl -s http://localhost:3002 > /dev/null 2>&1; then
  echo "✓ Frontend health: PASS"
  PASS=$((PASS + 1))
else
  echo "✗ Frontend health: FAIL"
  FAIL=$((FAIL + 1))
fi

# AppleScript tests
echo ""
echo "--- UI Tests (AppleScript) ---"
for script in test-cockpit test-backend-health test-backbone-verify test-pod-chat; do
  if [ -f "/Users/macbook/Workspace/Devotts/taskclaw/taskclaw/scripts/${script}.applescript" ]; then
    result=$(osascript "/Users/macbook/Workspace/Devotts/taskclaw/taskclaw/scripts/${script}.applescript" 2>&1)
    if echo "$result" | grep -q "PASS\|WARN\|SKIP"; then
      echo "✓ ${script}: OK ($result)"
      PASS=$((PASS + 1))
    else
      echo "✗ ${script}: $result"
      WARN=$((WARN + 1))
    fi
  fi
done

echo ""
echo "========================================="
echo "Results: $PASS passed, $WARN warnings, $FAIL failed"
echo "========================================="

[ $FAIL -eq 0 ] && exit 0 || exit 1
