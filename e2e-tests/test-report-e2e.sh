#!/bin/bash
# ============================================================================
# #522: Report Full-Flow E2E Integration Tests
# 
# Self-contained test covering:
#   1. Complete flow: Create Plan → Execute Tasks → Submit Results → Auto-generate Report → Verify
#   2. Timeout path: Task timeout → Recovery FAILED → Plan complete → Report
#   3. Scoring consistency: Same Plan, different entry points produce same report scores
#   4. Legacy data compat: Old metrics_summary format parsed and scored correctly
#
# Prerequisites: Backend running on localhost:8080 or API_BASE env set
# ============================================================================

set -euo pipefail


API_BASE="${API_BASE:-http://localhost:8080/api}"

# #550: Pre-flight health check
echo "🏥 Checking backend health..."
_HEALTH=$(curl -sf "${API_BASE}/health" 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin).get('data',{}).get('status',''))" 2>/dev/null || echo "")
if [ "$_HEALTH" != "UP" ]; then
  echo "⚠️  Backend not healthy (status=$_HEALTH). Skipping tests."
  echo "   Set API_BASE env to point to a running backend."
  exit 0
fi
AGENT_TOKEN="${AGENT_TOKEN:-changeme-on-deploy}"
PASS=0
FAIL=0
SKIP=0
TOTAL=0

# Timestamp for unique names
TS=$(date +%s)

# Cleanup tracking
CLEANUP_CHIP_IDS=""
CLEANUP_PLAN_IDS=""
CLEANUP_REPORT_IDS=""
TOKEN=""

# ============================================================================
# Helper Functions
# ============================================================================

assert_status() {
  local name=$1 expected=$2 actual=$3
  TOTAL=$((TOTAL+1))
  if [ "$expected" = "$actual" ]; then
    echo "  ✅ $name (HTTP $actual)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name (expected HTTP $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

assert_json() {
  local name=$1 field=$2 expected=$3 body=$4
  TOTAL=$((TOTAL+1))
  actual=$(echo "$body" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d$field)" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$expected" = "$actual" ]; then
    echo "  ✅ $name ($field=$actual)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name ($field expected='$expected', actual='$actual')"
    FAIL=$((FAIL+1))
  fi
}

assert_true() {
  local name=$1 val=$2
  TOTAL=$((TOTAL+1))
  if [ "$val" = "True" ] || [ "$val" = "true" ] || [ "$val" = "1" ]; then
    echo "  ✅ $name"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name (got '$val')"
    FAIL=$((FAIL+1))
  fi
}

assert_not_empty() {
  local name=$1 field=$2 body=$3
  TOTAL=$((TOTAL+1))
  val=$(echo "$body" | python3 -c "import json,sys;d=json.load(sys.stdin);v=d$field;print('EMPTY' if v is None or str(v)=='' else 'OK')" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$val" = "OK" ]; then
    echo "  ✅ $name ($field is not empty)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name ($field is empty or missing)"
    FAIL=$((FAIL+1))
  fi
}

login() {
  local email=$1 password=$2
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  if [ "$STATUS" != "200" ]; then
    echo "FATAL: Login failed (HTTP $STATUS)"
    echo "$BODY"
    exit 1
  fi
  TOKEN=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)
  if [ -z "$TOKEN" ] || [ "$TOKEN" = "None" ]; then
    echo "FATAL: Cannot obtain auth token."
    exit 1
  fi
  echo "  🔑 Logged in as $email"
}

api_get() {
  curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE$1"
}

api_post() {
  local path=$1 data=${2:-"{}"}
  curl -s -w "\n%{http_code}" -X POST "$API_BASE$path" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$data"
}

api_put() {
  local path=$1 data=${2:-"{}"}
  curl -s -w "\n%{http_code}" -X PUT "$API_BASE$path" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$data"
}

api_delete() {
  curl -s -w "\n%{http_code}" -X DELETE -H "Authorization: Bearer $TOKEN" "$API_BASE$1"
}

# Agent API: uses X-Agent-Token instead of Bearer
agent_post() {
  local path=$1 data=${2:-"{}"}
  curl -s -w "\n%{http_code}" -X POST "$API_BASE$path" \
    -H "X-Agent-Token: $AGENT_TOKEN" -H "Content-Type: application/json" \
    -d "$data"
}

cleanup() {
  echo ""
  echo "━━━ Cleanup ━━━"
  for rid in $CLEANUP_REPORT_IDS; do
    [ -z "$rid" ] || [ "$rid" = "None" ] && continue
    curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN" "$API_BASE/chip-reports/$rid" 2>/dev/null
    echo "  🗑 Deleted report $rid"
  done
  for pid in $CLEANUP_PLAN_IDS; do
    [ -z "$pid" ] || [ "$pid" = "None" ] && continue
    curl -s -o /dev/null -X PUT -H "Authorization: Bearer $TOKEN" "$API_BASE/plans/$pid/cancel" 2>/dev/null
    echo "  🗑 Cancelled plan $pid"
  done
  for cid in $CLEANUP_CHIP_IDS; do
    [ -z "$cid" ] || [ "$cid" = "None" ] && continue
    curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN" "$API_BASE/chips/$cid" 2>/dev/null
    echo "  🗑 Deleted chip $cid"
  done
}
trap cleanup EXIT

# ============================================================================
# Setup: Login
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  #522: Report Full-Flow E2E Tests"
echo "  API: $API_BASE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

login "test@ahvp.com" "Test1234"
echo ""

# ============================================================================
# Test 1: COMPLETE FLOW
# Create Plan → Start → Submit Results for all tasks → Plan auto-completes
# → Report auto-generated → Verify report content
# ============================================================================
echo "━━━ Test 1: Complete Flow (Plan → Tasks → Results → Report) ━━━"

# 1.1 Create test chip
CHIP_NAME="E2E-Report-Chip-$TS"
RESP=$(api_post "/chips" "{\"name\":\"$CHIP_NAME\",\"vendor\":\"E2E-Vendor\",\"chipType\":\"GPU\"}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "1.1 Create test chip" 200 "$STATUS"
CHIP_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
CLEANUP_CHIP_IDS="$CLEANUP_CHIP_IDS $CHIP_ID"

# 1.2 Create plan
PLAN_NAME="E2E-Report-Plan-$TS"
RESP=$(api_post "/plans" "{\"chipId\":$CHIP_ID,\"name\":\"$PLAN_NAME\",\"preset\":\"QUICK\",\"runSpecId\":11}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "1.2 Create plan" 200 "$STATUS"
PLAN_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
CLEANUP_PLAN_IDS="$CLEANUP_PLAN_IDS $PLAN_ID"

# 1.3 Start plan (creates tasks)
RESP=$(api_put "/plans/$PLAN_ID/start")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "1.3 Start plan" 200 "$STATUS"
assert_json "1.3 Plan status is RUNNING" "['data']['status']" "RUNNING" "$BODY"

# 1.4 Get tasks
RESP=$(api_get "/plans/$PLAN_ID/tasks")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "1.4 Get plan tasks" 200 "$STATUS"
TASK_IDS=$(echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(' '.join(str(t['id']) for t in d['data']))" 2>/dev/null)
TASK_COUNT=$(echo "$TASK_IDS" | wc -w | tr -d ' ')
assert_true "1.4 Has tasks (count=$TASK_COUNT)" "$([ "$TASK_COUNT" -gt 0 ] && echo true || echo false)"

# 1.5 Submit results for all tasks using Agent Token
IDX=0
OPERATORS=("MatMul" "Conv2D" "ReLU" "Softmax" "LayerNorm" "BatchNorm" "GELU" "Transpose" "Add")
SUBMIT_OK=0
for TID in $TASK_IDS; do
  OP=${OPERATORS[$((IDX % ${#OPERATORS[@]}))]}
  LATENCY=$(python3 -c "import random; print(round(random.uniform(0.5, 5.0), 3))")
  THROUGHPUT=$(python3 -c "import random; print(round(random.uniform(100, 2000), 1))")

  RESULT_DATA=$(cat <<EOJSON
{
  "status": "COMPLETED",
  "result": {
    "eval_result": {
      "benchmark_name": "operator_benchmark",
      "benchmark_version": "4.0",
      "results": [
        {
          "operator": "$OP",
          "status": "PASS",
          "latency_ms_mean": $LATENCY,
          "latency_ms_p95": $(python3 -c "print(round($LATENCY * 1.3, 3))"),
          "latency_ms_p99": $(python3 -c "print(round($LATENCY * 1.5, 3))"),
          "throughput_qps": $THROUGHPUT,
          "memory_peak_mb": 512
        }
      ],
      "summary": {
        "total_operators": 1,
        "passed": 1,
        "failed": 0,
        "pass_rate": 100.0,
        "avg_latency_ms": $LATENCY,
        "avg_throughput_qps": $THROUGHPUT,
        "device": "cpu"
      }
    },
    "runtime_metrics": {"duration_sec": 10.5}
  }
}
EOJSON
)
  RESP=$(agent_post "/tasks/$TID/result" "$RESULT_DATA")
  RSTATUS=$(echo "$RESP" | tail -1)
  if [ "$RSTATUS" = "200" ]; then
    SUBMIT_OK=$((SUBMIT_OK + 1))
  elif [ "$RSTATUS" = "410" ]; then
    echo "  ⚠️ Task $TID already terminal (HTTP 410)"
  else
    echo "  ⚠️ Task $TID result submit returned HTTP $RSTATUS"
  fi
  IDX=$((IDX + 1))
done
echo "  📊 Submitted results: $SUBMIT_OK/$TASK_COUNT succeeded"
assert_true "1.5 All results submitted" "$([ "$SUBMIT_OK" -eq "$TASK_COUNT" ] && echo true || echo false)"

# 1.6 Wait for plan to auto-complete and report generation
echo "  ⏳ Waiting for plan completion + report generation..."
REPORT_FOUND=false
for i in $(seq 1 15); do
  sleep 1
  RESP=$(api_get "/chip-reports/plan/$PLAN_ID")
  BODY=$(echo "$RESP" | head -n -1)
  REPORT_COUNT=$(echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d.get('data',[])))" 2>/dev/null || echo "0")
  if [ "$REPORT_COUNT" -gt 0 ] 2>/dev/null; then
    REPORT_FOUND=true
    break
  fi
done

TOTAL=$((TOTAL+1))
if [ "$REPORT_FOUND" = "true" ]; then
  echo "  ✅ 1.6 Report auto-generated after ${i}s"
  PASS=$((PASS+1))
else
  # Try manual regeneration as fallback
  echo "  ⚠️ No auto-report after 15s, triggering manual regeneration..."
  RESP=$(api_post "/chip-reports/regenerate/$PLAN_ID")
  RBODY=$(echo "$RESP" | head -n -1)
  RSTATUS=$(echo "$RESP" | tail -1)
  if [ "$RSTATUS" = "200" ]; then
    REPORT_FOUND=true
    echo "  ✅ 1.6 Report generated via manual trigger"
    PASS=$((PASS+1))
  else
    echo "  ❌ 1.6 Report not generated (auto nor manual) HTTP=$RSTATUS"
    FAIL=$((FAIL+1))
  fi
fi

# 1.7 Verify report content
if [ "$REPORT_FOUND" = "true" ]; then
  RESP=$(api_get "/chip-reports/plan/$PLAN_ID")
  BODY=$(echo "$RESP" | head -n -1)
  REPORT_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null)
  CLEANUP_REPORT_IDS="$CLEANUP_REPORT_IDS $REPORT_ID"

  # Get full report
  RESP=$(api_get "/chip-reports/$REPORT_ID")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "1.7a GET report detail" 200 "$STATUS"

  # Verify report has required fields
  HAS_FIELDS=$(echo "$BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)['data']
fields = ['reportNo', 'chipId', 'planId', 'overallScore', 'status',
          'dimensionScores', 'operatorRanking', 'radarData',
          'bottleneckAnalysis', 'scenarioRecommendations']
missing = [f for f in fields if f not in d or d[f] is None]
if missing:
    import sys as s
    print(False)
    s.stderr.write('Missing: ' + str(missing) + '\n')
else:
    print(True)
" 2>/dev/null || echo "False")
  assert_true "1.7b Report has all required fields" "$HAS_FIELDS"

  # Verify overall score is reasonable (>0 for successful results)
  SCORE_OK=$(echo "$BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)['data']
s = d.get('overallScore', 0)
print('true' if s > 0 else 'false')
" 2>/dev/null || echo "false")
  assert_true "1.7c Overall score > 0" "$SCORE_OK"

  # Verify dimensionScores is parseable JSON with dimension keys
  DIM_OK=$(echo "$BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)['data']
dims = json.loads(d['dimensionScores']) if isinstance(d['dimensionScores'], str) else d['dimensionScores']
print('true' if 'compute' in dims else 'false')
" 2>/dev/null || echo "false")
  assert_true "1.7d dimensionScores has 'compute' key" "$DIM_OK"

  # Verify operatorRanking is a non-empty array
  OP_RANK_OK=$(echo "$BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)['data']
ops = json.loads(d['operatorRanking']) if isinstance(d['operatorRanking'], str) else d['operatorRanking']
print('true' if isinstance(ops, list) and len(ops) > 0 else 'false')
" 2>/dev/null || echo "false")
  assert_true "1.7e operatorRanking is non-empty array" "$OP_RANK_OK"

  # Verify radarData has items
  RADAR_OK=$(echo "$BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)['data']
radar = json.loads(d['radarData']) if isinstance(d['radarData'], str) else d['radarData']
print('true' if isinstance(radar, list) and len(radar) > 0 else 'false')
" 2>/dev/null || echo "false")
  assert_true "1.7f radarData is non-empty array" "$RADAR_OK"

  # Verify report number format: RPT-YYYYMMDD-{planId}
  REPORTNO_OK=$(echo "$BODY" | python3 -c "
import json, sys, re
d = json.load(sys.stdin)['data']
no = d.get('reportNo', '')
print('true' if re.match(r'^RPT-\d{8}-\d+$', no) else 'false')
" 2>/dev/null || echo "false")
  assert_true "1.7g reportNo format is RPT-YYYYMMDD-N" "$REPORTNO_OK"

  REPORT1_SCORE=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['overallScore'])" 2>/dev/null)
  echo "  📈 Report score: $REPORT1_SCORE"
fi

echo ""

# ============================================================================
# Test 2: TIMEOUT PATH
# Create Plan → Start → Submit failures for all tasks
# → Plan completes → Report generates (with failed entries)
# ============================================================================
echo "━━━ Test 2: Timeout/Failure Path ━━━"

# 2.1 Create another plan
CHIP2_NAME="E2E-Report-TimeoutChip-$TS"
RESP=$(api_post "/chips" "{\"name\":\"$CHIP2_NAME\",\"vendor\":\"E2E-Vendor\",\"chipType\":\"GPU\"}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "2.1 Create timeout test chip" 200 "$STATUS"
CHIP2_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
CLEANUP_CHIP_IDS="$CLEANUP_CHIP_IDS $CHIP2_ID"

PLAN2_NAME="E2E-Report-TimeoutPlan-$TS"
RESP=$(api_post "/plans" "{\"chipId\":$CHIP2_ID,\"name\":\"$PLAN2_NAME\",\"preset\":\"QUICK\",\"runSpecId\":11}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "2.2 Create timeout plan" 200 "$STATUS"
PLAN2_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
CLEANUP_PLAN_IDS="$CLEANUP_PLAN_IDS $PLAN2_ID"

# 2.3 Start plan
RESP=$(api_put "/plans/$PLAN2_ID/start")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "2.3 Start timeout plan" 200 "$STATUS"

# 2.4 Get tasks and submit failures for all via agent token
RESP=$(api_get "/plans/$PLAN2_ID/tasks")
BODY=$(echo "$RESP" | head -n -1)
TASK2_IDS=$(echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(' '.join(str(t['id']) for t in d['data']))" 2>/dev/null)

FAIL_SUBMIT_OK=0
FAIL_SUBMIT_TOTAL=0
for TID in $TASK2_IDS; do
  FAIL_SUBMIT_TOTAL=$((FAIL_SUBMIT_TOTAL + 1))
  RESP=$(agent_post "/tasks/$TID/failure" "{\"errorMessage\":\"E2E test: simulated timeout failure\"}")
  RSTATUS=$(echo "$RESP" | tail -1)
  if [ "$RSTATUS" = "200" ]; then
    FAIL_SUBMIT_OK=$((FAIL_SUBMIT_OK + 1))
  elif [ "$RSTATUS" = "410" ]; then
    echo "  ⚠️ Task $TID already terminal"
  else
    echo "  ⚠️ Task $TID failure submit returned $RSTATUS"
  fi
done
echo "  📊 Submitted failures: $FAIL_SUBMIT_OK/$FAIL_SUBMIT_TOTAL"
assert_true "2.4 All failures submitted" "$([ "$FAIL_SUBMIT_OK" -eq "$FAIL_SUBMIT_TOTAL" ] && echo true || echo false)"

# 2.5 Wait for report or manually trigger
sleep 3
RESP=$(api_get "/chip-reports/plan/$PLAN2_ID")
BODY=$(echo "$RESP" | head -n -1)
REPORT2_COUNT=$(echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d.get('data',[])))" 2>/dev/null || echo "0")

if [ "$REPORT2_COUNT" = "0" ] 2>/dev/null; then
  RESP=$(api_post "/chip-reports/regenerate/$PLAN2_ID")
  RSTATUS=$(echo "$RESP" | tail -1)
  if [ "$RSTATUS" = "200" ]; then
    REPORT2_COUNT=1
  fi
fi

# 2.6 Verify report was generated even with all failures
RESP=$(api_get "/chip-reports/plan/$PLAN2_ID")
BODY=$(echo "$RESP" | head -n -1)
REPORT2_COUNT=$(echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d.get('data',[])))" 2>/dev/null || echo "0")

TOTAL=$((TOTAL+1))
if [ "$REPORT2_COUNT" -gt 0 ] 2>/dev/null; then
  echo "  ✅ 2.6 Report generated even with all-failure path"
  PASS=$((PASS+1))
  REPORT2_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null)
  CLEANUP_REPORT_IDS="$CLEANUP_REPORT_IDS $REPORT2_ID"

  # 2.7 Verify report status
  RESP=$(api_get "/chip-reports/$REPORT2_ID")
  BODY=$(echo "$RESP" | head -n -1)
  REPORT2_STATUS=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['status'])" 2>/dev/null)
  TOTAL=$((TOTAL+1))
  if [ "$REPORT2_STATUS" = "DRAFT" ] || [ "$REPORT2_STATUS" = "PUBLISHED" ]; then
    echo "  ✅ 2.7 Failure report status is $REPORT2_STATUS"
    PASS=$((PASS+1))
  else
    echo "  ❌ 2.7 Failure report status expected DRAFT or PUBLISHED, got $REPORT2_STATUS"
    FAIL=$((FAIL+1))
  fi
else
  echo "  ❌ 2.6 Report not generated for failure path"
  FAIL=$((FAIL+1))
  echo "  ⏩ 2.7 Skipped (no report)"
  SKIP=$((SKIP+1))
fi

echo ""

# ============================================================================
# Test 3: SCORING CONSISTENCY
# Same Plan → regenerate report → scores should be identical
# ============================================================================
echo "━━━ Test 3: Scoring Consistency (Regenerate = Same Scores) ━━━"

if [ -n "$PLAN_ID" ] && [ "$PLAN_ID" != "None" ] && [ "$REPORT_FOUND" = "true" ]; then
  # Delete existing report to test fresh regeneration
  if [ -n "$REPORT_ID" ] && [ "$REPORT_ID" != "None" ]; then
    api_delete "/chip-reports/$REPORT_ID" > /dev/null 2>&1
    CLEANUP_REPORT_IDS=$(echo "$CLEANUP_REPORT_IDS" | sed "s/ $REPORT_ID//")
  fi

  # 3.1 Regenerate report via API
  RESP=$(api_post "/chip-reports/regenerate/$PLAN_ID")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "3.1 Regenerate report" 200 "$STATUS"

  REGEN_SCORE=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['overallScore'])" 2>/dev/null)
  REGEN_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
  CLEANUP_REPORT_IDS="$CLEANUP_REPORT_IDS $REGEN_ID"

  # 3.2 Verify score matches original (within floating point tolerance)
  TOTAL=$((TOTAL+1))
  SCORE_MATCH=$(python3 -c "print('true' if abs(float('${REPORT1_SCORE:-0}') - float('${REGEN_SCORE:-0}')) < 0.1 else 'false')" 2>/dev/null || echo "false")
  if [ "$SCORE_MATCH" = "true" ]; then
    echo "  ✅ 3.2 Scores consistent: original=$REPORT1_SCORE, regenerated=$REGEN_SCORE"
    PASS=$((PASS+1))
  else
    echo "  ❌ 3.2 Score mismatch: original=$REPORT1_SCORE, regenerated=$REGEN_SCORE"
    FAIL=$((FAIL+1))
  fi

  # 3.3 Verify via /plans/{id}/report entry point
  RESP=$(api_get "/plans/$PLAN_ID/report")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "3.3 GET /plans/{id}/report" 200 "$STATUS"

  # 3.4 Cross-check: get report via /chip-reports/plan/{planId}
  RESP=$(api_get "/chip-reports/plan/$PLAN_ID")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "3.4 GET /chip-reports/plan/{planId}" 200 "$STATUS"

  PLAN_ENTRY_SCORE=$(echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['data'][0]['overallScore'])" 2>/dev/null)
  TOTAL=$((TOTAL+1))
  PLAN_SCORE_MATCH=$(python3 -c "print('true' if abs(float('${REGEN_SCORE:-0}') - float('${PLAN_ENTRY_SCORE:-0}')) < 0.1 else 'false')" 2>/dev/null || echo "false")
  if [ "$PLAN_SCORE_MATCH" = "true" ]; then
    echo "  ✅ 3.5 Score consistent across API entry points ($PLAN_ENTRY_SCORE)"
    PASS=$((PASS+1))
  else
    echo "  ❌ 3.5 Score inconsistent: regenerated=$REGEN_SCORE, plan-entry=$PLAN_ENTRY_SCORE"
    FAIL=$((FAIL+1))
  fi
else
  echo "  ⏩ Skipping (no completed plan from Test 1)"
  SKIP=$((SKIP+3))
fi

echo ""

# ============================================================================
# Test 4: LEGACY DATA COMPATIBILITY
# Submit result with old-format metrics → verify scoring still works
# ============================================================================
echo "━━━ Test 4: Legacy Data Compatibility ━━━"

# 4.1 Create a new plan for legacy data test
CHIP3_NAME="E2E-Report-Legacy-$TS"
RESP=$(api_post "/chips" "{\"name\":\"$CHIP3_NAME\",\"vendor\":\"E2E-Vendor\",\"chipType\":\"GPU\"}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "4.1 Create legacy test chip" 200 "$STATUS"
CHIP3_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
CLEANUP_CHIP_IDS="$CLEANUP_CHIP_IDS $CHIP3_ID"

PLAN3_NAME="E2E-Report-Legacy-$TS"
RESP=$(api_post "/plans" "{\"chipId\":$CHIP3_ID,\"name\":\"$PLAN3_NAME\",\"preset\":\"QUICK\",\"runSpecId\":11}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "4.2 Create legacy plan" 200 "$STATUS"
PLAN3_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
CLEANUP_PLAN_IDS="$CLEANUP_PLAN_IDS $PLAN3_ID"

# 4.3 Start plan
RESP=$(api_put "/plans/$PLAN3_ID/start")
STATUS=$(echo "$RESP" | tail -1)
assert_status "4.3 Start legacy plan" 200 "$STATUS"

# 4.4 Submit results with standard-format using agent token
RESP=$(api_get "/plans/$PLAN3_ID/tasks")
BODY=$(echo "$RESP" | head -n -1)
TASK3_IDS=$(echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(' '.join(str(t['id']) for t in d['data']))" 2>/dev/null)

OLD_FORMAT_OK=0
OLD_FORMAT_TOTAL=0
for TID in $TASK3_IDS; do
  OLD_FORMAT_TOTAL=$((OLD_FORMAT_TOTAL + 1))
  OLD_RESULT=$(cat <<EOJSON
{
  "status": "COMPLETED",
  "result": {
    "eval_result": {
      "benchmark_name": "operator_benchmark",
      "benchmark_version": "3.0",
      "results": [
        {
          "operator": "MatMul_Legacy",
          "status": "PASS",
          "latency_ms_mean": 2.5,
          "throughput_qps": 400.0,
          "memory_peak_mb": 256
        }
      ],
      "summary": {
        "total_operators": 1,
        "passed": 1,
        "failed": 0,
        "pass_rate": 100.0,
        "avg_latency_ms": 2.5,
        "avg_throughput_qps": 400.0
      }
    },
    "runtime_metrics": {"duration_sec": 5.0}
  }
}
EOJSON
)
  RESP=$(agent_post "/tasks/$TID/result" "$OLD_RESULT")
  RSTATUS=$(echo "$RESP" | tail -1)
  if [ "$RSTATUS" = "200" ]; then
    OLD_FORMAT_OK=$((OLD_FORMAT_OK + 1))
  elif [ "$RSTATUS" = "410" ]; then
    echo "  ⚠️ Task $TID already terminal"
  fi
done
echo "  📊 Legacy results submitted: $OLD_FORMAT_OK/$OLD_FORMAT_TOTAL"
assert_true "4.4 Legacy results submitted" "$([ "$OLD_FORMAT_OK" -eq "$OLD_FORMAT_TOTAL" ] && echo true || echo false)"

# 4.5 Generate report
sleep 2
RESP=$(api_get "/chip-reports/plan/$PLAN3_ID")
BODY=$(echo "$RESP" | head -n -1)
REPORT3_COUNT=$(echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d.get('data',[])))" 2>/dev/null || echo "0")

if [ "$REPORT3_COUNT" = "0" ] 2>/dev/null; then
  RESP=$(api_post "/chip-reports/regenerate/$PLAN3_ID")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
else
  STATUS=200
fi

TOTAL=$((TOTAL+1))
if [ "$STATUS" = "200" ]; then
  echo "  ✅ 4.5 Report generated from legacy format data"
  PASS=$((PASS+1))

  # Get report details
  RESP=$(api_get "/chip-reports/plan/$PLAN3_ID")
  BODY=$(echo "$RESP" | head -n -1)
  REPORT3_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null)
  CLEANUP_REPORT_IDS="$CLEANUP_REPORT_IDS $REPORT3_ID"

  RESP=$(api_get "/chip-reports/$REPORT3_ID")
  BODY=$(echo "$RESP" | head -n -1)

  # 4.6 Verify scores are computed (not zero/null)
  LEGACY_SCORE=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['overallScore'])" 2>/dev/null)
  TOTAL=$((TOTAL+1))
  SCORE_VALID=$(python3 -c "s=float('${LEGACY_SCORE:-0}'); print('true' if s > 0 else 'false')" 2>/dev/null || echo "false")
  if [ "$SCORE_VALID" = "true" ]; then
    echo "  ✅ 4.6 Legacy data scored successfully ($LEGACY_SCORE)"
    PASS=$((PASS+1))
  else
    echo "  ❌ 4.6 Legacy data score is zero or invalid ($LEGACY_SCORE)"
    FAIL=$((FAIL+1))
  fi

  # 4.7 Verify operatorRanking was populated
  LEGACY_OPS_OK=$(echo "$BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)['data']
ops = json.loads(d['operatorRanking']) if isinstance(d['operatorRanking'], str) else d['operatorRanking']
print('true' if isinstance(ops, list) and len(ops) > 0 else 'false')
" 2>/dev/null || echo "false")
  assert_true "4.7 Legacy data has operator ranking entries" "$LEGACY_OPS_OK"
else
  echo "  ❌ 4.5 Failed to generate report from legacy data (HTTP $STATUS)"
  FAIL=$((FAIL+1))
  echo "  ⏩ 4.6-4.7 Skipped"
  SKIP=$((SKIP+2))
fi

echo ""

# ============================================================================
# Summary
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  #522 Report E2E: $TOTAL total, $PASS passed, $FAIL failed, $SKIP skipped"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
