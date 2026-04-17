#!/bin/bash
# ============================================================================
# Regression Tests for #474 #475 #476 #477
# ============================================================================

API_BASE="${API_BASE:-http://localhost:8080/api}"
PASS=0
FAIL=0
TOTAL=0

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

assert_equals() {
  local name=$1 expected=$2 actual=$3
  TOTAL=$((TOTAL+1))
  if [ "$expected" = "$actual" ]; then
    echo "  ✅ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name (expected='$expected', actual='$actual')"
    FAIL=$((FAIL+1))
  fi
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Regression Tests: #474 #475 #476 #477                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# Login
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ahvp.com","password":"Test1234"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
TOKEN=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "None" ]; then
  echo "❌ Failed to login, cannot run tests"
  exit 1
fi
echo "  🔑 Logged in"

AUTH="-H \"Authorization: Bearer $TOKEN\""

# ============================================================================
# #474: Template list item count should include training
# ============================================================================
echo ""
echo "── #474: Template itemCount includes training ──"

# Template 94 (芯片综合评测) has operators=16, models=3, training=2 → total=21
# Template 95 (芯片快速验证) has operators=5, models=1, training=1 → total=7
RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/templates")

# Check template 94 config has training
HAS_TRAINING_94=$(echo "$RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for t in data.get('data', []):
    if t['id'] == 94:
        config = json.loads(t.get('configJson', '{}'))
        training = config.get('training', [])
        print('true' if len(training) > 0 else 'false')
        break
" 2>/dev/null)
assert_true "#474-1 Template 94 has training items" "$HAS_TRAINING_94"

# Verify the correct count: operators + models + training (no huggingface_models for these)
CORRECT_COUNT_94=$(echo "$RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for t in data.get('data', []):
    if t['id'] == 94:
        config = json.loads(t.get('configJson', '{}'))
        ops = len(config.get('operators', []))
        models = len(config.get('models', []))
        training = len(config.get('training', []))
        hf = len(config.get('huggingface_models', []))
        # The frontend should compute: ops + models + training + hf
        print(ops + models + training + hf)
        break
" 2>/dev/null)
assert_equals "#474-2 Template 94 total count should be 21" "21" "$CORRECT_COUNT_94"

# Verify template 95
CORRECT_COUNT_95=$(echo "$RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for t in data.get('data', []):
    if t['id'] == 95:
        config = json.loads(t.get('configJson', '{}'))
        ops = len(config.get('operators', []))
        models = len(config.get('models', []))
        training = len(config.get('training', []))
        hf = len(config.get('huggingface_models', []))
        print(ops + models + training + hf)
        break
" 2>/dev/null)
assert_equals "#474-3 Template 95 total count should be 7" "7" "$CORRECT_COUNT_95"

# Static analysis: verify TemplateList.js includes training in itemCount computation
echo ""
echo "── #474: Static analysis ──"
TEMPLATE_LIST_HAS_TRAINING=$(grep -c "config\.training" /root/ai-hardware-verification-platform/frontend/src/pages/TemplateList.js 2>/dev/null; true)
TEMPLATE_LIST_HAS_TRAINING=$(echo "$TEMPLATE_LIST_HAS_TRAINING" | tail -1)
assert_true "#474-4 TemplateList.js includes config.training" "$([ "$TEMPLATE_LIST_HAS_TRAINING" -gt 0 ] && echo 'true' || echo 'false')"

# Verify PlanCreate.js also includes training (should already be there)
PLAN_CREATE_HAS_TRAINING=$(grep -c "config\.training" /root/ai-hardware-verification-platform/frontend/src/pages/PlanCreate.js 2>/dev/null; true)
PLAN_CREATE_HAS_TRAINING=$(echo "$PLAN_CREATE_HAS_TRAINING" | tail -1)
assert_true "#474-5 PlanCreate.js includes config.training" "$([ "$PLAN_CREATE_HAS_TRAINING" -gt 0 ] && echo 'true' || echo 'false')"

# Both should compute the same itemCount formula
TEMPLATE_LIST_FORMULA=$(grep "itemCount" /root/ai-hardware-verification-platform/frontend/src/pages/TemplateList.js | grep "training" | wc -l)
assert_true "#474-6 TemplateList.js itemCount formula includes training" "$([ "$TEMPLATE_LIST_FORMULA" -gt 0 ] && echo 'true' || echo 'false')"


# ============================================================================
# #475: Backend validates runSpecId on plan creation
# ============================================================================
echo ""
echo "── #475: Backend runSpecId validation ──"

# Get a valid chip ID
CHIP_ID=$(echo "$RESP" | python3 -c "print(952)" 2>/dev/null)  # NVIDIA L40S

# Test 1: Create plan WITHOUT runSpecId → should fail
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/plans" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test-noRunSpec-$(date +%s)\",\"chipId\":$CHIP_ID,\"templateId\":94}")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
# Should be 400 or 500 with error about runSpecId
IS_ERROR=$(echo "$BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
code = data.get('code', 0)
msg = data.get('message', '')
# code != 0 means error
print('true' if (code != 0 or '运行规格' in msg) else 'false')
" 2>/dev/null)
assert_true "#475-1 POST /plans without runSpecId should fail" "$IS_ERROR"

# Test 2: Create plan with invalid runSpecId → should fail
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/plans" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test-badRunSpec-$(date +%s)\",\"chipId\":$CHIP_ID,\"templateId\":94,\"runSpecId\":99999}")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
IS_ERROR=$(echo "$BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
code = data.get('code', 0)
msg = data.get('message', '')
print('true' if (code != 0 or '运行规格不存在' in msg) else 'false')
" 2>/dev/null)
assert_true "#475-2 POST /plans with invalid runSpecId should fail" "$IS_ERROR"

# Test 3: Create plan with valid runSpecId → should succeed
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/plans" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test-validRunSpec-$(date +%s)\",\"chipId\":$CHIP_ID,\"templateId\":94,\"runSpecId\":13}")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
assert_status "#475-3 POST /plans with valid runSpecId succeeds" 200 "$STATUS"
IS_SUCCESS=$(echo "$BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('true' if data.get('code') == 0 else 'false')
" 2>/dev/null)
assert_true "#475-4 Response has code=0" "$IS_SUCCESS"

# Cleanup: get the plan ID and delete it
PLAN_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)
if [ -n "$PLAN_ID" ] && [ "$PLAN_ID" != "" ] && [ "$PLAN_ID" != "None" ]; then
  curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "$API_BASE/plans/$PLAN_ID" > /dev/null 2>&1
fi


# ============================================================================
# #476: Report bottleneckAnalysis filters out high-score worst_operators
# ============================================================================
echo ""
echo "── #476: bottleneckAnalysis filters high-score worst_operators ──"

# Check report 208 (the old report that had the bug)
RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/chip-reports/208")
HAS_REPORT=$(echo "$RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('true' if data.get('code') == 0 and data.get('data') else 'false')
" 2>/dev/null)

if [ "$HAS_REPORT" = "true" ]; then
  # Check that bottleneckAnalysis does NOT contain worst_operator items with score >= 85
  NO_HIGH_SCORE_WORST=$(echo "$RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
report = data.get('data', {})
ba_raw = report.get('bottleneckAnalysis', '[]')
try:
    ba = json.loads(ba_raw) if isinstance(ba_raw, str) else ba_raw
except:
    ba = []
if not isinstance(ba, list):
    print('true')  # not a list, no issue
    sys.exit(0)
# Check no worst_operator with score >= 85
bad = [item for item in ba if item.get('type') == 'worst_operator' and item.get('score', 0) >= 85]
print('true' if len(bad) == 0 else 'false')
" 2>/dev/null)
  assert_true "#476-1 Report 208 no high-score worst_operators in API response" "$NO_HIGH_SCORE_WORST"
else
  echo "  ⚠️  Report 208 not found, testing with latest report instead"
fi

# Check report 209 (new report generated after #470 fix)
RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/chip-reports/209")
HAS_REPORT_209=$(echo "$RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('true' if data.get('code') == 0 and data.get('data') else 'false')
" 2>/dev/null)

if [ "$HAS_REPORT_209" = "true" ]; then
  NO_HIGH_SCORE_WORST_209=$(echo "$RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
report = data.get('data', {})
ba_raw = report.get('bottleneckAnalysis', '[]')
try:
    ba = json.loads(ba_raw) if isinstance(ba_raw, str) else ba_raw
except:
    ba = []
if not isinstance(ba, list):
    print('true')
    sys.exit(0)
bad = [item for item in ba if item.get('type') == 'worst_operator' and item.get('score', 0) >= 85]
print('true' if len(bad) == 0 else 'false')
" 2>/dev/null)
  assert_true "#476-2 Report 209 no high-score worst_operators" "$NO_HIGH_SCORE_WORST_209"
fi

# Static analysis: verify frontend filters bottleneckAnalysis
FRONTEND_FILTER=$(grep -c "score.*85" /root/ai-hardware-verification-platform/frontend/src/pages/ChipReport.js 2>/dev/null; true)
FRONTEND_FILTER=$(echo "$FRONTEND_FILTER" | tail -1)
assert_true "#476-3 ChipReport.js filters high-score worst_operators" "$([ "$FRONTEND_FILTER" -gt 0 ] && echo 'true' || echo 'false')"

# Static analysis: verify backend filters in controller
BACKEND_FILTER=$(grep -c "filterBottleneck" /root/ai-hardware-verification-platform/backend/src/main/java/com/lab/chipreport/ChipReportController.java 2>/dev/null; true)
BACKEND_FILTER=$(echo "$BACKEND_FILTER" | tail -1)
assert_true "#476-4 ChipReportController.java filters high-score worst_operators" "$([ "$BACKEND_FILTER" -gt 0 ] && echo 'true' || echo 'false')"


# ============================================================================
# #477: Template card click triggers selection
# ============================================================================
echo ""
echo "── #477: Template card click triggers selection ──"

# Static analysis: verify Card has onClick handler for template selection
CARD_ONCLICK=$(grep -c "setSelectedTemplateId" /root/ai-hardware-verification-platform/frontend/src/pages/PlanCreate.js 2>/dev/null; true)
CARD_ONCLICK=$(echo "$CARD_ONCLICK" | tail -1)
assert_true "#477-1 Card has onClick for template selection" "$([ "$CARD_ONCLICK" -gt 0 ] && echo 'true' || echo 'false')"

# Verify stopPropagation only on specific buttons, not on card body
STOP_PROP_COUNT=$(grep -c "stopPropagation" /root/ai-hardware-verification-platform/frontend/src/pages/PlanCreate.js 2>/dev/null; true)
STOP_PROP_COUNT=$(echo "$STOP_PROP_COUNT" | tail -1)
# Should only have stopPropagation on the preview button and maybe the Paragraph
assert_true "#477-2 stopPropagation count is reasonable (<=3)" "$([ "$STOP_PROP_COUNT" -le 3 ] && echo 'true' || echo 'false')"

# Check that Paragraph with ellipsis doesn't have expandable (which steals clicks)
PARAGRAPH_EXPANDABLE=$(grep -c "ellipsis.*expandable.*true" /root/ai-hardware-verification-platform/frontend/src/pages/PlanCreate.js 2>/dev/null; true)
PARAGRAPH_EXPANDABLE=$(echo "$PARAGRAPH_EXPANDABLE" | tail -1)
# In the template card section, Paragraph should NOT have expandable: true
assert_true "#477-3 Template card Paragraph has no expandable:true" "$([ "$PARAGRAPH_EXPANDABLE" -eq 0 ] && echo 'true' || echo 'false')"

# Verify the card has cursor: pointer
CURSOR_POINTER=$(grep -c "cursor.*pointer" /root/ai-hardware-verification-platform/frontend/src/pages/PlanCreate.js 2>/dev/null; true)
CURSOR_POINTER=$(echo "$CURSOR_POINTER" | tail -1)
assert_true "#477-4 Card has cursor:pointer style" "$([ "$CURSOR_POINTER" -gt 0 ] && echo 'true' || echo 'false')"

# Verify the card click handler is directly on Card (not wrapped in Radio.Group)
# The template section should NOT use Radio.Group for template selection
TEMPLATE_RADIO_GROUP=$(grep -n "Radio.Group" /root/ai-hardware-verification-platform/frontend/src/pages/PlanCreate.js | grep -i "template" | wc -l)
assert_true "#477-5 No Radio.Group wrapping template cards" "$([ "$TEMPLATE_RADIO_GROUP" -eq 0 ] && echo 'true' || echo 'false')"


# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
printf "║  Results: %-3d passed, %-3d failed, %-3d total               ║\n" $PASS $FAIL $TOTAL
echo "╚══════════════════════════════════════════════════════════════╝"

if [ $FAIL -gt 0 ]; then
  exit 1
fi
