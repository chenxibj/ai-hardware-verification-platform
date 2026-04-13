#!/bin/bash
# Post-deploy check script — run manually after deployment
# Usage: bash deploy/post-deploy-check.sh

set -euo pipefail

echo "========================================"
echo "  Post-Deploy Check - $(date)"
echo "========================================"
echo

PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" -eq 0 ]; then
    echo "✅ $name"
    PASS=$((PASS + 1))
  else
    echo "❌ $name"
    FAIL=$((FAIL + 1))
  fi
}

# 1. Container status
echo "--- Container Status ---"
for c in ahvp-backend ahvp-frontend ahvp-postgres ahvp-redis ahvp-minio; do
  STATUS=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo "missing")
  UPTIME=$(docker inspect -f '{{.State.StartedAt}}' "$c" 2>/dev/null || echo "N/A")
  echo "  $c: $STATUS (started: $UPTIME)"
  [ "$STATUS" = "running" ] && check "Container $c running" 0 || check "Container $c running" 1
done
echo

# 2. Version info
echo "--- Version Info ---"
GIT_VER=$(cd /root/ai-hardware-verification-platform && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BACKEND_ENV_VER=$(docker inspect ahvp-backend --format='{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep GIT_COMMIT | cut -d= -f2 | head -c8 || echo "N/A")
echo "  Git HEAD:     $GIT_VER"
echo "  Backend env:  $BACKEND_ENV_VER"

HEALTH_RESP=$(curl -sf http://localhost:8080/api/health 2>/dev/null || echo "{}")
HEALTH_VER=$(echo "$HEALTH_RESP" | grep -oP '"version"\s*:\s*"\K[^"]+' 2>/dev/null || echo "N/A")
echo "  Health API:   $HEALTH_VER"

[ "$BACKEND_ENV_VER" = "$GIT_VER" ] && check "Backend version matches git HEAD" 0 || check "Backend version matches git HEAD ($BACKEND_ENV_VER != $GIT_VER)" 1
echo

# 3. Health endpoint
echo "--- Health Endpoint ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/health 2>/dev/null || echo "000")
echo "  /api/health: HTTP $HTTP_CODE"
[ "$HTTP_CODE" = "200" ] && check "Health endpoint returns 200" 0 || check "Health endpoint returns 200" 1
echo

# 4. Key API endpoints
echo "--- API Endpoints ---"
for ep in /api/auth/login /api/chips /api/templates; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8080${ep}" 2>/dev/null || echo "000")
  echo "  $ep: HTTP $HTTP"
done
echo

# 5. Frontend routes
echo "--- Frontend Routes ---"
for route in / /chips /plans /templates /reports /nodes; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost${route}" 2>/dev/null || echo "000")
  echo "  $route: HTTP $HTTP"
  [ "$HTTP" = "200" ] && check "Route $route returns 200" 0 || check "Route $route returns 200" 1
done
echo

# 6. Resource usage
echo "--- Resource Usage ---"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" ahvp-backend ahvp-frontend ahvp-postgres ahvp-redis ahvp-minio 2>/dev/null || echo "  (docker stats unavailable)"
echo

# 7. Recent backend logs (errors only)
echo "--- Recent Backend Errors (last 50 lines) ---"
docker logs ahvp-backend --tail 50 2>&1 | grep -i 'error\|exception\|fail' | tail -10 || echo "  (no errors)"
echo

# 8. Disk usage
echo "--- Disk Usage ---"
df -h / | tail -1
echo "  Docker: $(docker system df 2>/dev/null | head -4 || echo 'N/A')"
echo

# Summary
echo "========================================"
echo "  Results: $PASS passed, $FAIL failed"
echo "========================================"
[ $FAIL -eq 0 ] && echo "🎉 All post-deploy checks passed!" || echo "⚠️ Some checks failed. Review above."
exit $FAIL
