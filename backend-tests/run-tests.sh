#!/bin/bash
set -e

API_BASE="${API_BASE:-http://localhost:8080/api}"
PASS=0
FAIL=0
TOTAL=0

# Helper functions
assert_status() {
  local name=$1 expected=$2 actual=$3
  TOTAL=$((TOTAL+1))
  if [ "$expected" = "$actual" ]; then
    echo "✅ $name (HTTP $actual)"
    PASS=$((PASS+1))
  else
    echo "❌ $name (expected HTTP $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

assert_json() {
  local name=$1 field=$2 expected=$3 body=$4
  TOTAL=$((TOTAL+1))
  actual=$(echo "$body" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d$field)" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$expected" = "$actual" ]; then
    echo "✅ $name ($field=$actual)"
    PASS=$((PASS+1))
  else
    echo "❌ $name ($field expected=$expected, actual=$actual)"
    FAIL=$((FAIL+1))
  fi
}

echo "================================"
echo "Backend API Integration Tests"
echo "API_BASE: $API_BASE"
echo "================================"
echo ""

# ---- Auth Tests ----
echo "--- Auth ---"

# Login with valid credentials
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ahvp.com","password":"Test1234"}')
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /auth/login (valid)" 200 "$STATUS"
assert_json "Login returns code 0" "['code']" "0" "$BODY"
TOKEN=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)
assert_json "Login returns token" "['data']['token'][:10]" "${TOKEN:0:10}" "$BODY"

# Login with invalid password
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ahvp.com","password":"wrong"}')
assert_status "POST /auth/login (invalid)" 401 "$STATUS"

# Access protected endpoint without token
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/tasks")
assert_status "GET /tasks (no token)" 401 "$STATUS"

# /auth/me
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/auth/me")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /auth/me" 200 "$STATUS"
assert_json "/auth/me returns email" "['data']['email']" "test@ahvp.com" "$BODY"

echo ""
echo "--- Templates ---"

# List templates
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/templates")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /templates" 200 "$STATUS"
TEMPLATE_COUNT=$(echo "$BODY" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
TOTAL=$((TOTAL+1))
if [ "$TEMPLATE_COUNT" -ge 3 ] 2>/dev/null; then
  echo "✅ Templates count >= 3 ($TEMPLATE_COUNT)"
  PASS=$((PASS+1))
else
  echo "❌ Templates count < 3 ($TEMPLATE_COUNT)"
  FAIL=$((FAIL+1))
fi

# Create template
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/templates" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"API-Test-Template","evalType":"PERFORMANCE","configJson":"{}"}')
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /templates (create)" 200 "$STATUS"
NEW_TMPL_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

# Delete template
if [ -n "$NEW_TMPL_ID" ] && [ "$NEW_TMPL_ID" != "None" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" "$API_BASE/templates/$NEW_TMPL_ID")
  assert_status "DELETE /templates/$NEW_TMPL_ID" 200 "$STATUS"
fi

echo ""
echo "--- Tasks ---"

# Create task
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"API-Test-$(date +%s)\",\"evalType\":\"PERFORMANCE\",\"priority\":\"LOW\"}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /tasks (create)" 200 "$STATUS"
TASK_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

# Get task
if [ -n "$TASK_ID" ] && [ "$TASK_ID" != "None" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/tasks/$TASK_ID")
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "GET /tasks/$TASK_ID" 200 "$STATUS"

  # Cancel task
  RESP=$(curl -s -w "\n%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" "$API_BASE/tasks/$TASK_ID/cancel")
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /tasks/$TASK_ID/cancel" 200 "$STATUS"
fi

# Task stats
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/tasks/stats")
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /tasks/stats" 200 "$STATUS"

echo ""
echo "--- Nodes ---"

RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/nodes")
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /nodes" 200 "$STATUS"

echo ""
echo "--- Reports ---"

RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/reports")
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /reports" 200 "$STATUS"

echo ""
echo "--- Assets ---"

RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/assets")
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /assets" 200 "$STATUS"

echo ""
echo "--- Health ---"

RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/health")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /health" 200 "$STATUS"
assert_json "Health status UP" "['status']" "UP" "$BODY"

echo ""
echo "--- Version ---"
RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/version")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /version" 200 "$STATUS"
# Check gitCommit field is not empty
GIT_COMMIT_VAL=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['gitCommit'])" 2>/dev/null || echo "MISSING")
TOTAL=$((TOTAL+1))
if [ "$GIT_COMMIT_VAL" != "MISSING" ] && [ "$GIT_COMMIT_VAL" != "unknown" ] && [ -n "$GIT_COMMIT_VAL" ]; then
  echo "✅ Version has gitCommit ($GIT_COMMIT_VAL)"
  PASS=$((PASS+1))
else
  echo "❌ Version missing gitCommit ($GIT_COMMIT_VAL)"
  FAIL=$((FAIL+1))
fi

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed, $TOTAL total"
echo "================================"

if [ $FAIL -gt 0 ]; then
  exit 1
fi

# Cleanup test data after tests
echo ''
echo '--- Cleaning up test data ---'
bash ../deploy/cleanup-test-data.sh || echo 'Cleanup failed (non-fatal)'
