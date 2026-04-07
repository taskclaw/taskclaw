#!/bin/bash
# Test Pod API endpoints
# Usage: TOKEN=<jwt> ACCOUNT=<account_id> bash scripts/test-pod-api.sh

TOKEN="${TOKEN:-}"
ACCOUNT="${ACCOUNT:-}"
BASE="http://localhost:3003"

if [ -z "$TOKEN" ] || [ -z "$ACCOUNT" ]; then
  echo "Usage: TOKEN=<jwt> ACCOUNT=<account_id> bash $0"
  echo "Skipping API tests (no auth token provided)"
  exit 0
fi

echo "=== Pod API Tests ==="

# GET /pods (empty list)
RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE/accounts/$ACCOUNT/pods" \
  -H "Authorization: Bearer $TOKEN")
[ "$RESULT" == "200" ] && echo "✓ GET /pods returns 200" || echo "✗ GET /pods returned $RESULT"

# POST /pods (create)
POD_RESULT=$(curl -s -X POST \
  "$BASE/accounts/$ACCOUNT/pods" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Pod","description":"Created by test","color":"#6366f1"}')
POD_ID=$(echo "$POD_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$POD_ID" ] && echo "✓ POST /pods created pod: $POD_ID" || echo "✗ POST /pods failed: $POD_RESULT"

# GET /pods/:id
if [ -n "$POD_ID" ]; then
  RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
    "$BASE/accounts/$ACCOUNT/pods/$POD_ID" \
    -H "Authorization: Bearer $TOKEN")
  [ "$RESULT" == "200" ] && echo "✓ GET /pods/:id returns 200" || echo "✗ GET /pods/:id returned $RESULT"

  # DELETE /pods/:id (cleanup)
  curl -s -X DELETE "$BASE/accounts/$ACCOUNT/pods/$POD_ID" -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "✓ DELETE /pods/:id cleanup done"
fi

echo "=== Pod API Tests Done ==="
