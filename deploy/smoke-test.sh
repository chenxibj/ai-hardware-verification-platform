#!/usr/bin/env bash
# Smoke test for AHVP deployment
# Returns 0 if all checks pass, 1 otherwise

PASS=0
FAIL=0
ERRORS=""

check() {
  local name="$1"
  local result="$2"
  if [ "$result" -eq 0 ]; then
    echo "✅ PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "❌ FAIL: $name"
    FAIL=$((FAIL + 1))
    ERRORS="${ERRORS}
  - $name"
  fi
}

echo "========================================"
echo "  Smoke Test - $(date)"
echo "========================================"
echo

# Test 1: Homepage returns 200 and contains .js reference
echo "[1/8] Checking homepage..."
HOMEPAGE=$(curl -s -o /tmp/smoke_home.html -w "%{http_code}" http://localhost/ 2>/dev/null || echo "000")
if [ "$HOMEPAGE" = "200" ] && grep -q '\.js' /tmp/smoke_home.html 2>/dev/null; then
  check "Homepage returns 200 with .js references" 0
else
  echo "  HTTP status: $HOMEPAGE"
  echo "  .js refs: $(grep -c '\.js' /tmp/smoke_home.html 2>/dev/null || echo 'none')"
  check "Homepage returns 200 with .js references" 1
fi

# Test 2: JS bundle is downloadable and > 500KB
echo "[2/8] Checking JS bundle size..."
JS_FILE=$(grep -oP '(?<=src=")[^"]*\.js' /tmp/smoke_home.html 2>/dev/null | head -1 || echo "")
if [ -n "$JS_FILE" ]; then
  # Handle relative paths
  if [[ "$JS_FILE" != http* ]]; then
    JS_FILE="http://localhost${JS_FILE}"
  fi
  JS_SIZE=$(curl -s -o /dev/null -w "%{size_download}" "$JS_FILE" 2>/dev/null || echo "0")
  echo "  JS URL: $JS_FILE"
  echo "  Size: ${JS_SIZE} bytes"
  if [ "${JS_SIZE:-0}" -gt 500000 ]; then
    check "JS bundle downloadable and > 500KB" 0
  else
    check "JS bundle downloadable and > 500KB (got ${JS_SIZE} bytes)" 1
  fi
else
  echo "  No JS file found in homepage HTML"
  check "JS bundle downloadable and > 500KB" 1
fi

# Test 3: Backend login API returns code=0
echo "[3/8] Checking backend login API..."
LOGIN_RESP=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ahvp.com","password":"Test1234"}' 2>/dev/null || echo "{}")
LOGIN_CODE=$(echo "$LOGIN_RESP" | grep -oP '"code"\s*:\s*\K[0-9]+' 2>/dev/null || echo "-1")
echo "  Response: $LOGIN_RESP"
echo "  Code: $LOGIN_CODE"
if [ "$LOGIN_CODE" = "0" ]; then
  check "Login API returns code=0" 0
else
  check "Login API returns code=0 (got code=$LOGIN_CODE)" 1
fi

# Test 4: All containers are running
echo "[4/8] Checking container status..."
EXPECTED="ahvp-frontend ahvp-backend ahvp-postgres ahvp-redis ahvp-minio"
ALL_UP=0
for c in $EXPECTED; do
  STATUS=$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null || echo "false")
  if [ "$STATUS" != "true" ]; then
    echo "  Container $c is NOT running"
    ALL_UP=1
  fi
done
check "All containers running" $ALL_UP

# Test 5: Browser render verification (Puppeteer)
echo "[5/8] Running browser render check..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RENDER_SCRIPT="$SCRIPT_DIR/render-check.js"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$RENDER_SCRIPT" ]; then
  echo "  render-check.js not found at $RENDER_SCRIPT"
  check "Browser render check" 1
else
  # Ensure puppeteer is installed
  if [ ! -d "$PROJECT_ROOT/node_modules/puppeteer" ]; then
    echo "  puppeteer not installed, skipping render check"
    check "Browser render check (puppeteer not installed)" 1
  else
    echo "  Running full render check (with login verification)..."
    RENDER_OUTPUT=$(cd "$PROJECT_ROOT" && node "$RENDER_SCRIPT" 2>&1)
    RENDER_RC=$?
    echo "$RENDER_OUTPUT" | sed 's/^/  /'
    if [ $RENDER_RC -eq 0 ]; then
      check "Browser render check (full)" 0
    else
      check "Browser render check (full)" 1
    fi
  fi
fi

# Test 6: Business APIs return data
echo "[6/8] Checking business APIs..."
TOKEN=$(echo "$LOGIN_RESP" | grep -oP '"token"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then
  CHIPS=$(curl -s http://localhost:8080/api/chips -H "Authorization: Bearer $TOKEN" 2>/dev/null)
  CHIPS_TOTAL=$(echo "$CHIPS" | grep -oP '"total"\s*:\s*\K[0-9]+' 2>/dev/null || echo "0")
  TEMPLATES=$(curl -s http://localhost:8080/api/templates 2>/dev/null)
  TEMPLATES_TOTAL=$(echo "$TEMPLATES" | grep -oP '"total"\s*:\s*\K[0-9]+' 2>/dev/null || echo "0")
  echo "  Chips: $CHIPS_TOTAL, Templates: $TEMPLATES_TOTAL"
  if [ "${CHIPS_TOTAL:-0}" -gt 0 ] && [ "${TEMPLATES_TOTAL:-0}" -gt 0 ]; then
    check "Business APIs return data" 0
  else
    check "Business APIs return data (chips=$CHIPS_TOTAL, templates=$TEMPLATES_TOTAL)" 1
  fi
else
  echo "  No token available, skipping business API check"
  check "Business APIs return data (no token)" 1
fi

# Test 7: Frontend routes all return 200
echo "[7/8] Checking frontend routes..."
ROUTES_OK=0
for route in / /chips /plans /templates /reports /nodes; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost${route}" 2>/dev/null || echo "000")
  if [ "$HTTP" != "200" ]; then
    echo "  Route ${route} returned $HTTP"
    ROUTES_OK=1
  fi
done
check "All frontend routes return 200" $ROUTES_OK

# Test 8: Version consistency
echo "[8/8] Checking version consistency..."
EXPECTED_COMMIT=$(cd /root/ai-hardware-verification-platform && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BACKEND_COMMIT=$(docker inspect ahvp-backend --format='{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep GIT_COMMIT | cut -d= -f2 | head -c8 || echo "")
BACKEND_APP_VER=$(docker inspect ahvp-backend --format='{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep APP_VERSION | cut -d= -f2 || echo "")
echo "  Expected commit: $EXPECTED_COMMIT, Backend commit: $BACKEND_COMMIT"
echo "  APP_VERSION: $BACKEND_APP_VER"
if [ -n "$BACKEND_COMMIT" ] && [ "$BACKEND_COMMIT" = "$EXPECTED_COMMIT" ]; then
  check "Version consistency" 0
else
  check "Version consistency (expected $EXPECTED_COMMIT, got $BACKEND_COMMIT)" 1
fi

# Summary
echo
echo "========================================"
echo "  Results: $PASS passed, $FAIL failed"
echo "========================================"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "Failed checks:$ERRORS"
  exit 1
fi

echo ""
echo "🎉 All smoke tests passed!"
exit 0
