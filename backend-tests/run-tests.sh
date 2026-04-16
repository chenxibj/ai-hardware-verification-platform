#!/bin/bash
# ============================================================================
# AHVP Backend API Integration Tests — v2
# 48 functional test cases covering all critical API paths
# Pure curl-based, no browser, CI < 2 minutes
# ============================================================================

API_BASE="${API_BASE:-http://localhost:8080/api}"
PASS=0
FAIL=0
SKIP=0
TOTAL=0

# Cleanup tracking
CLEANUP_CHIP_IDS=""
CLEANUP_PLAN_IDS=""
CLEANUP_TMPL_IDS=""

# ---- Helper Functions ----

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

# Fuzzy match: check that actual output CONTAINS expected substring
assert_json_contains() {
  local name=$1 field=$2 expected_substr=$3 body=$4
  TOTAL=$((TOTAL+1))
  actual=$(echo "$body" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d$field)" 2>/dev/null || echo "PARSE_ERROR")
  if echo "$actual" | grep -q "$expected_substr"; then
    echo "  ✅ $name ($field contains '$expected_substr')"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name ($field does not contain '$expected_substr', actual='${actual:0:120}')"
    FAIL=$((FAIL+1))
  fi
}

assert_not_empty() {
  local name=$1 field=$2 body=$3
  TOTAL=$((TOTAL+1))
  actual=$(echo "$body" | python3 -c "import json,sys;d=json.load(sys.stdin);v=d$field;print('EMPTY' if v is None or v=='' else 'OK')" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$actual" = "OK" ]; then
    echo "  ✅ $name ($field is not empty)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name ($field is empty or missing)"
    FAIL=$((FAIL+1))
  fi
}

assert_true() {
  local name=$1 condition=$2
  TOTAL=$((TOTAL+1))
  if [ "$condition" = "true" ] || [ "$condition" = "True" ] || [ "$condition" = "1" ]; then
    echo "  ✅ $name"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name (condition=$condition)"
    FAIL=$((FAIL+1))
  fi
}

skip_test() {
  local name=$1 reason=$2
  TOTAL=$((TOTAL+1))
  SKIP=$((SKIP+1))
  echo "  ⚠️  $name — SKIPPED ($reason)"
}

TS=$(date +%s)

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        AHVP Backend API Integration Tests v2               ║"
echo "║        48 functional tests · curl-based · CI < 2min        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "API_BASE: $API_BASE"
echo "Timestamp: $TS"
echo ""

# ============================================================================
# 1. AUTH (4 cases)
# ============================================================================
echo "━━━ 1. Authentication (4 cases) ━━━"

# 1.1 Valid login
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ahvp.com","password":"Test1234"}')
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "1.1 POST /auth/login (valid creds)" 200 "$STATUS"
TOKEN=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "None" ]; then
  echo "FATAL: Cannot obtain auth token. Aborting."
  exit 1
fi

# 1.2 Invalid password
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ahvp.com","password":"wrong"}')
assert_status "1.2 POST /auth/login (wrong password)" 401 "$STATUS"

# 1.3 No token → 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/tasks")
assert_status "1.3 GET /tasks (no token)" 401 "$STATUS"

# 1.4 Get current user
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/auth/me")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "1.4 GET /auth/me" 200 "$STATUS"
assert_json "1.4 /auth/me email" "['data']['email']" "test@ahvp.com" "$BODY"

echo ""

# ============================================================================
# 2. CHIPS CRUD (6 cases)
# ============================================================================
echo "━━━ 2. Chips CRUD (6 cases) ━━━"

CHIP_NAME="CI-Chip-$TS"

# 2.1 Create chip
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/chips" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"$CHIP_NAME\",\"vendor\":\"TestVendor\",\"chipType\":\"CPU\"}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "2.1 POST /chips (create)" 200 "$STATUS"
CHIP_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
CLEANUP_CHIP_IDS="$CLEANUP_CHIP_IDS $CHIP_ID"

# 2.2 List chips
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/chips?page=0&size=5")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "2.2 GET /chips (list)" 200 "$STATUS"
IS_LIST=$(echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(isinstance(d['data'], list))" 2>/dev/null)
assert_true "2.2 data is array" "$IS_LIST"

# 2.3 Get chip detail
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/chips/$CHIP_ID")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "2.3 GET /chips/$CHIP_ID (detail)" 200 "$STATUS"
assert_json "2.3 chip name matches" "['data']['name']" "$CHIP_NAME" "$BODY"

# 2.4 Update chip
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$API_BASE/chips/$CHIP_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"$CHIP_NAME-Updated\",\"vendor\":\"TestVendor\",\"chipType\":\"CPU\"}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "2.4 PUT /chips/$CHIP_ID (update)" 200 "$STATUS"
assert_json "2.4 updated name" "['data']['name']" "$CHIP_NAME-Updated" "$BODY"

# 2.5 Search by keyword
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/chips?keyword=$CHIP_NAME-Updated")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "2.5 GET /chips?keyword (search)" 200 "$STATUS"
FOUND=$(echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(any(c['name']=='$CHIP_NAME-Updated' for c in d['data']))
" 2>/dev/null)
assert_true "2.5 search result contains updated chip" "$FOUND"

# 2.6 Delete chip
RESP=$(curl -s -w "\n%{http_code}" -X DELETE "$API_BASE/chips/$CHIP_ID" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "2.6 DELETE /chips/$CHIP_ID" 200 "$STATUS"
# Remove from cleanup since already deleted
CLEANUP_CHIP_IDS=$(echo "$CLEANUP_CHIP_IDS" | sed "s/ $CHIP_ID//")

echo ""

# ============================================================================
# 3. EVALUATION PLANS (7 cases)
# ============================================================================
echo "━━━ 3. Evaluation Plans (7 cases) ━━━"

# Create a chip for plan tests
PLAN_CHIP_NAME="CI-PlanChip-$TS"
PLAN_CHIP_ID=$(curl -s -X POST "$API_BASE/chips" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"$PLAN_CHIP_NAME\",\"vendor\":\"PlanVendor\",\"chipType\":\"GPU\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
CLEANUP_CHIP_IDS="$CLEANUP_CHIP_IDS $PLAN_CHIP_ID"

PLAN_NAME="CI-Plan-$TS"

# 3.1 Create plan
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/plans" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"chipId\":$PLAN_CHIP_ID,\"name\":\"$PLAN_NAME\",\"preset\":\"QUICK\"}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "3.1 POST /plans (create)" 200 "$STATUS"
PLAN_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
CLEANUP_PLAN_IDS="$CLEANUP_PLAN_IDS $PLAN_ID"
assert_not_empty "3.1 plan id exists" "['data']['id']" "$BODY"

# 3.2 Plan detail
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/plans/$PLAN_ID")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "3.2 GET /plans/$PLAN_ID (detail)" 200 "$STATUS"
assert_json "3.2 plan status is DRAFT" "['data']['status']" "DRAFT" "$BODY"

# 3.3 Update plan
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$API_BASE/plans/$PLAN_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"$PLAN_NAME-Updated\",\"chipId\":$PLAN_CHIP_ID,\"preset\":\"QUICK\"}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "3.3 PUT /plans/$PLAN_ID (update)" 200 "$STATUS"

# 3.4 Start plan
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$API_BASE/plans/$PLAN_ID/start" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "3.4 PUT /plans/$PLAN_ID/start" 200 "$STATUS"
assert_json "3.4 status becomes RUNNING" "['data']['status']" "RUNNING" "$BODY"

# 3.5 Pause plan
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$API_BASE/plans/$PLAN_ID/pause" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "3.5 PUT /plans/$PLAN_ID/pause" 200 "$STATUS"
assert_json "3.5 status becomes PAUSED" "['data']['status']" "PAUSED" "$BODY"

# 3.6 Cancel plan
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$API_BASE/plans/$PLAN_ID/cancel" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "3.6 PUT /plans/$PLAN_ID/cancel" 200 "$STATUS"
assert_json "3.6 status becomes CANCELLED" "['data']['status']" "CANCELLED" "$BODY"

# 3.7 Illegal transition: start a cancelled plan
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$API_BASE/plans/$PLAN_ID/start" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "3.7 start cancelled plan → 400" 400 "$STATUS"

echo ""

# ============================================================================
# 4. EVALUATION TASKS (5 cases)
# ============================================================================
echo "━━━ 4. Evaluation Tasks (5 cases) ━━━"

# Get tasks from the plan we started (they were created when plan started)
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/plans/$PLAN_ID/tasks")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)

# 4.1 Plan tasks list
assert_status "4.1 GET /plans/$PLAN_ID/tasks" 200 "$STATUS"
TASK_COUNT=$(echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['data']))" 2>/dev/null || echo "0")
assert_true "4.1 tasks is array with items" "$([ "$TASK_COUNT" -gt 0 ] 2>/dev/null && echo true || echo false)"

# Extract first task ID
TASK_ID=$(echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['data'][0]['id'])" 2>/dev/null)

# 4.2 Task has required fields
HAS_FIELDS=$(echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
t=d['data'][0]
print(all(k in t for k in ['taskType','status','chipId']))
" 2>/dev/null || echo "False")
assert_true "4.2 task has taskType, status, chipId" "$HAS_FIELDS"

# 4.3 Task stats
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/tasks/stats")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "4.3 GET /tasks/stats" 200 "$STATUS"
assert_json "4.3 stats has code 0" "['code']" "0" "$BODY"

# 4.4 Task detail
if [ -n "$TASK_ID" ] && [ "$TASK_ID" != "None" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/tasks/$TASK_ID")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "4.4 GET /tasks/$TASK_ID (detail)" 200 "$STATUS"
else
  skip_test "4.4 GET /tasks/\$TASK_ID (detail)" "no task ID available"
fi

# 4.5 Task logs
if [ -n "$TASK_ID" ] && [ "$TASK_ID" != "None" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/tasks/$TASK_ID/logs")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "4.5 GET /tasks/$TASK_ID/logs" 200 "$STATUS"
else
  skip_test "4.5 GET /tasks/\$TASK_ID/logs" "no task ID available"
fi

echo ""

# ============================================================================
# 5. REPORTS (5 cases)
# ============================================================================
echo "━━━ 5. Evaluation Reports (5 cases) ━━━"

# 5.1 Report list
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/reports")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "5.1 GET /reports (list)" 200 "$STATUS"
IS_RECORDS=$(echo "$BODY" | python3 -c "
import json,sys;d=json.load(sys.stdin)
print(isinstance(d['data']['records'], list))
" 2>/dev/null || echo "False")
assert_true "5.1 data.records is array" "$IS_RECORDS"

# Get first report ID
REPORT_ID=$(echo "$BODY" | python3 -c "
import json,sys;d=json.load(sys.stdin)
recs=d['data']['records']
print(recs[0]['id'] if recs else 'NONE')
" 2>/dev/null || echo "NONE")

if [ "$REPORT_ID" != "NONE" ] && [ -n "$REPORT_ID" ]; then
  # 5.2 Report detail
  RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/reports/$REPORT_ID")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "5.2 GET /reports/$REPORT_ID (detail)" 200 "$STATUS"
  assert_not_empty "5.2 has overallScore" "['data']['overallScore']" "$BODY"

  # 5.3 Dimension keys are all English
  DIM_KEYS_OK=$(echo "$BODY" | python3 -c "
import json,sys,re
d=json.load(sys.stdin)
ds=d['data']['dimensionScores']
if isinstance(ds, str): ds=json.loads(ds)
chinese=re.compile('[\u4e00-\u9fff]')
print(not any(chinese.search(k) for k in ds.keys()))
" 2>/dev/null || echo "False")
  assert_true "5.3 dimensionScores keys are English" "$DIM_KEYS_OK"

  # 5.4 bottleneckAnalysis is valid JSON
  BA_OK=$(echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ba=d['data']['bottleneckAnalysis']
if isinstance(ba, str): json.loads(ba)
print('True')
" 2>/dev/null || echo "False")
  assert_true "5.4 bottleneckAnalysis is valid JSON" "$BA_OK"

  # 5.5 scenarioRecommendations is valid JSON
  SR_OK=$(echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
sr=d['data']['scenarioRecommendations']
if isinstance(sr, str): json.loads(sr)
print('True')
" 2>/dev/null || echo "False")
  assert_true "5.5 scenarioRecommendations is valid JSON" "$SR_OK"
else
  skip_test "5.2 GET /reports/\$REPORT_ID" "no reports exist"
  skip_test "5.3 dimensionScores keys English" "no reports exist"
  skip_test "5.4 bottleneckAnalysis JSON" "no reports exist"
  skip_test "5.5 scenarioRecommendations JSON" "no reports exist"
fi

echo ""

# ============================================================================
# 6. COMPARISONS (3 cases)
# ============================================================================
echo "━━━ 6. Report Comparisons (3 cases) ━━━"

# Get two report IDs
RPT_PAIR=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/reports" | python3 -c "
import json,sys
d=json.load(sys.stdin)
recs=d['data']['records']
if len(recs)>=2: print(recs[0]['id'], recs[1]['id'])
else: print('SKIP')
" 2>/dev/null || echo "SKIP")

if [ "$RPT_PAIR" != "SKIP" ]; then
  R1=$(echo $RPT_PAIR | cut -d' ' -f1)
  R2=$(echo $RPT_PAIR | cut -d' ' -f2)

  # 6.1 Create comparison
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/comparisons" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"baselineReportId\":$R1,\"testReportIds\":[$R2]}")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "6.1 POST /comparisons (valid)" 200 "$STATUS"

  # 6.2 Result has dimension comparison
  HAS_DIM=$(echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
reports=d.get('data',{}).get('reports',[])
if reports:
    print('dimensionVsPcts' in reports[0] or 'overallVsPct' in reports[0])
else:
    print('False')
" 2>/dev/null || echo "False")
  assert_true "6.2 comparison has dimensionVsPcts/overallVsPct" "$HAS_DIM"
else
  skip_test "6.1 POST /comparisons (valid)" "need ≥2 reports"
  skip_test "6.2 comparison has dimension data" "need ≥2 reports"
fi

# 6.3 Missing params → error
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/comparisons" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{}')
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "6.3 POST /comparisons (empty) → 400" 400 "$STATUS"

echo ""

# ============================================================================
# 7. TEMPLATES (4 cases)
# ============================================================================
echo "━━━ 7. Evaluation Templates (4 cases) ━━━"

# 7.1 Template list
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/templates")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "7.1 GET /templates (list)" 200 "$STATUS"

# 7.2 Create template
TMPL_NAME="CI-Tmpl-$TS"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/templates" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"$TMPL_NAME\",\"evalType\":\"PERFORMANCE\",\"evaluationLayer\":\"OPERATOR\",\"configJson\":\"{\\\"dtypes\\\":[\\\"FP16\\\"]}\"}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "7.2 POST /templates (create)" 200 "$STATUS"
TMPL_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
CLEANUP_TMPL_IDS="$CLEANUP_TMPL_IDS $TMPL_ID"

# 7.3 Template detail
if [ -n "$TMPL_ID" ] && [ "$TMPL_ID" != "None" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/templates/$TMPL_ID")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "7.3 GET /templates/$TMPL_ID (detail)" 200 "$STATUS"
  assert_json "7.3 template name matches" "['data']['name']" "$TMPL_NAME" "$BODY"
else
  skip_test "7.3 GET /templates/\$TMPL_ID" "template creation failed"
fi

# 7.4 Delete template
if [ -n "$TMPL_ID" ] && [ "$TMPL_ID" != "None" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X DELETE "$API_BASE/templates/$TMPL_ID" \
    -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "7.4 DELETE /templates/$TMPL_ID" 200 "$STATUS"
  CLEANUP_TMPL_IDS=$(echo "$CLEANUP_TMPL_IDS" | sed "s/ $TMPL_ID//")
else
  skip_test "7.4 DELETE /templates/\$TMPL_ID" "template creation failed"
fi

echo ""

# ============================================================================
# 8. NODES (3 cases)
# ============================================================================
echo "━━━ 8. Node Management (3 cases) ━━━"

# 8.1 Node list
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/nodes")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "8.1 GET /nodes (list)" 200 "$STATUS"

NODE_ID=$(echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
data=d.get('data',[])
print(data[0]['id'] if data else 'NONE')
" 2>/dev/null || echo "NONE")

# 8.2 Node detail
if [ "$NODE_ID" != "NONE" ] && [ -n "$NODE_ID" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/nodes/$NODE_ID")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "8.2 GET /nodes/$NODE_ID (detail)" 200 "$STATUS"
  assert_not_empty "8.2 node has name" "['data']['name']" "$BODY"
else
  skip_test "8.2 GET /nodes/\$NODE_ID (detail)" "no nodes exist"
  skip_test "8.2 node has name" "no nodes exist"
fi

# 8.3 Node has status field
if [ "$NODE_ID" != "NONE" ] && [ -n "$NODE_ID" ]; then
  HAS_STATUS=$(echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('status' in d.get('data',{}))
" 2>/dev/null || echo "False")
  assert_true "8.3 node has status field" "$HAS_STATUS"
else
  skip_test "8.3 node has status field" "no nodes exist"
fi

echo ""

# ============================================================================
# 9. DIMENSIONS (3 cases)
# ============================================================================
echo "━━━ 9. Dimension System (3 cases) ━━━"

# 9.1 Dimensions list
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/dimensions")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "9.1 GET /dimensions" 200 "$STATUS"
assert_json "9.1 dimensions code=0" "['code']" "0" "$BODY"

# 9.2 Each dimension has key, label, direction, primaryMetric
FIELDS_OK=$(echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
dims=d['data']['dimensions']
required=['key','label','direction','primaryMetric']
print(all(all(f in dim for f in required) for dim in dims))
" 2>/dev/null || echo "False")
assert_true "9.2 dimensions have key/label/direction/primaryMetric" "$FIELDS_OK"

# 9.3 All dimension keys are English (no Chinese)
KEYS_EN=$(echo "$BODY" | python3 -c "
import json,sys,re
d=json.load(sys.stdin)
keys=d['data']['allKeys']
chinese=re.compile('[\u4e00-\u9fff]')
print(not any(chinese.search(k) for k in keys))
" 2>/dev/null || echo "False")
assert_true "9.3 dimension keys are all English" "$KEYS_EN"

echo ""

# ============================================================================
# 10. DASHBOARD + HEALTH (3 cases)
# ============================================================================
echo "━━━ 10. Dashboard & Health (3 cases) ━━━"

# 10.1 Dashboard stats
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/dashboard/stats")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "10.1 GET /dashboard/stats" 200 "$STATUS"
assert_json "10.1 dashboard code=0" "['code']" "0" "$BODY"

# 10.2 Health check
RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/health")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "10.2 GET /health" 200 "$STATUS"
assert_json "10.2 health status=UP" "['data']['status']" "UP" "$BODY"

# 10.3 Version
RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/version")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "10.3 GET /version" 200 "$STATUS"
assert_not_empty "10.3 version has gitCommit" "['gitCommit']" "$BODY"

echo ""

# ============================================================================
# 11. DIGITAL ASSETS (2 cases)
# ============================================================================
echo "━━━ 11. Digital Assets (2 cases) ━━━"

# 11.1 Asset list
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/assets")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "11.1 GET /assets (list)" 200 "$STATUS"
assert_json "11.1 assets code=0" "['code']" "0" "$BODY"

# 11.2 Asset search
RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/assets?keyword=test")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "11.2 GET /assets?keyword=test (search)" 200 "$STATUS"

echo ""

# ============================================================================
# 12. LOG SYSTEM (3 cases)
# ============================================================================
echo "━━━ 12. Log System (3 cases) ━━━"

# Find a completed task with logs for testing
LOG_TASK_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/reports" | python3 -c "
import json,sys
d=json.load(sys.stdin)
recs=d['data']['records']
if recs:
    # Use a completed plan to find tasks with logs
    plan_id=recs[0].get('planId')
    print(plan_id if plan_id else 'NONE')
else:
    print('NONE')
" 2>/dev/null || echo "NONE")

# Get a task from a completed plan
if [ "$LOG_TASK_ID" != "NONE" ] && [ -n "$LOG_TASK_ID" ]; then
  REAL_TASK_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/plans/$LOG_TASK_ID/tasks" | python3 -c "
import json,sys
d=json.load(sys.stdin)
data=d.get('data',[])
for t in data:
    if t.get('status')=='COMPLETED':
        print(t['id']); break
else:
    if data: print(data[0]['id'])
    else: print('NONE')
" 2>/dev/null || echo "NONE")
else
  REAL_TASK_ID="NONE"
fi

if [ "$REAL_TASK_ID" != "NONE" ] && [ -n "$REAL_TASK_ID" ]; then
  # 12.1 Task logs query
  RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/tasks/$REAL_TASK_ID/logs")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "12.1 GET /tasks/$REAL_TASK_ID/logs" 200 "$STATUS"

  # 12.2 Filter by level
  RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/tasks/$REAL_TASK_ID/logs?level=ERROR")
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "12.2 GET /tasks/$REAL_TASK_ID/logs?level=ERROR" 200 "$STATUS"

  # 12.3 Log download
  RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/tasks/$REAL_TASK_ID/logs/download")
  DL_BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "12.3 GET /tasks/$REAL_TASK_ID/logs/download" 200 "$STATUS"
else
  skip_test "12.1 GET /tasks/\$TASK_ID/logs" "no task with logs found"
  skip_test "12.2 GET /tasks/\$TASK_ID/logs?level=ERROR" "no task with logs found"
  skip_test "12.3 GET /tasks/\$TASK_ID/logs/download" "no task with logs found"
fi

echo ""

# ============================================================================
# CLEANUP
# ============================================================================
echo "━━━ Cleanup ━━━"

# Clean up any remaining test resources via API
for id in $CLEANUP_TMPL_IDS; do
  [ -n "$id" ] && [ "$id" != "None" ] && \
    curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN" "$API_BASE/templates/$id"
done

for id in $CLEANUP_CHIP_IDS; do
  [ -n "$id" ] && [ "$id" != "None" ] && \
    curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN" "$API_BASE/chips/$id"
done

# Run DB cleanup for CI-prefixed test data
bash "$(dirname "$0")/../deploy/cleanup-test-data.sh" 2>/dev/null || true

echo "  Cleanup complete."
echo ""

# ============================================================================
# SUMMARY
# ============================================================================
echo "╔══════════════════════════════════════════════════════════════╗"
printf "║  Results: %-3d passed, %-3d failed, %-3d skipped, %-3d total   ║\n" $PASS $FAIL $SKIP $TOTAL
echo "╚══════════════════════════════════════════════════════════════╝"

if [ $FAIL -gt 0 ]; then
  exit 1
fi
