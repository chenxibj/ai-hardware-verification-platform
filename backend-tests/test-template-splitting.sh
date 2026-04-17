#!/bin/bash
# ============================================================================
# AHVP Template → Task Splitting E2E Tests
# Issue: #464 #465 — 模板驱动任务拆分 + 训练评测支持
#
# Tests the critical path: Template configJson → PlanTaskSplitter → Tasks
# Verifies that tasks generated match the template's operators/models/training
# ============================================================================

API_BASE="${API_BASE:-http://localhost:8080/api}"
PASS=0
FAIL=0
SKIP=0
TOTAL=0

TS=$(date +%s)

# ---- Helper Functions (same as run-tests.sh) ----

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
    echo "  ✅ $name (=$actual)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name (expected='$expected', actual='$actual')"
    FAIL=$((FAIL+1))
  fi
}

skip_test() {
  local name=$1 reason=$2
  TOTAL=$((TOTAL+1))
  SKIP=$((SKIP+1))
  echo "  ⚠️  $name — SKIPPED ($reason)"
}

# Cleanup tracking
CLEANUP_CHIP_IDS=""
CLEANUP_PLAN_IDS=""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Template → Task Splitting E2E Tests (#464 #465)           ║"
echo "║  Critical path: Template → Tasks consistency               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "API_BASE: $API_BASE"
echo ""

# ---- Auth ----
TOKEN=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ahvp.com","password":"Test1234"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "None" ]; then
  echo "FATAL: Cannot obtain auth token. Aborting."
  exit 1
fi
echo "Auth: OK (token obtained)"
echo ""

# ---- Create test chip ----
CHIP_NAME="CI-SplitTest-$TS"
CHIP_ID=$(curl -s -X POST "$API_BASE/chips" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"$CHIP_NAME\",\"vendor\":\"TestVendor\",\"chipType\":\"GPU\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
CLEANUP_CHIP_IDS="$CLEANUP_CHIP_IDS $CHIP_ID"
echo "Setup: Created test chip $CHIP_NAME (id=$CHIP_ID)"
echo ""

# ---- Helper: create plan with template, start it, get tasks ----
# Args: plan_name template_id [eval_config_extra]
create_and_split() {
  local plan_name=$1
  local template_id=$2
  local extra_config=${3:-""}

  local eval_config
  if [ -n "$extra_config" ]; then
    eval_config="{\"preset\":\"STANDARD\",\"templateId\":$template_id$extra_config}"
  else
    eval_config="{\"preset\":\"STANDARD\",\"templateId\":$template_id}"
  fi

  # Create plan
  local resp=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/plans" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"chipId\":$CHIP_ID,\"name\":\"$plan_name\",\"templateId\":$template_id,\"evalConfig\":$(echo "$eval_config" | python3 -c "import json,sys;print(json.dumps(sys.stdin.read().strip()))")}")
  local body=$(echo "$resp" | head -n -1)
  local status=$(echo "$resp" | tail -1)

  if [ "$status" != "200" ]; then
    echo "  ERROR: Failed to create plan (HTTP $status)"
    echo "  Body: $body"
    echo ""
    return 1
  fi

  local plan_id=$(echo "$body" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
  CLEANUP_PLAN_IDS="$CLEANUP_PLAN_IDS $plan_id"

  # Start plan (this triggers PlanTaskSplitter)
  curl -s -o /dev/null -X PUT "$API_BASE/plans/$plan_id/start" \
    -H "Authorization: Bearer $TOKEN"

  # Get tasks
  local tasks_resp=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/plans/$plan_id/tasks")

  # Return plan_id and tasks_resp via global vars
  _PLAN_ID=$plan_id
  _TASKS_RESP=$tasks_resp
  return 0
}

# ============================================================================
# TEST 1: "芯片综合评测" (id=94)
# configJson has: 16 operators + 3 models + 2 training = 21 items
# ============================================================================
echo "━━━ Test 1: 芯片综合评测 (template 94) — 16 ops + 3 models + 2 training = 21 tasks ━━━"

create_and_split "CI-Split-Comprehensive-$TS" 94
PLAN1_ID=$_PLAN_ID
TASKS1=$_TASKS_RESP

# 1.1 Total task count = 21
TASK_COUNT=$(echo "$TASKS1" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['data']))" 2>/dev/null || echo "0")
assert_equals "1.1 Total tasks = 21 (16 ops + 3 models + 2 training)" "21" "$TASK_COUNT"

# 1.2 Operator tasks = 16
OP_COUNT=$(echo "$TASKS1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='OPERATOR'))
" 2>/dev/null || echo "0")
assert_equals "1.2 Operator tasks = 16" "16" "$OP_COUNT"

# 1.3 Model tasks = 3
MODEL_COUNT=$(echo "$TASKS1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='MODEL'))
" 2>/dev/null || echo "0")
assert_equals "1.3 Model tasks = 3" "3" "$MODEL_COUNT"

# 1.4 Training tasks = 2 (#465)
TRAIN_COUNT=$(echo "$TASKS1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='TRAINING'))
" 2>/dev/null || echo "0")
assert_equals "1.4 Training tasks = 2" "2" "$TRAIN_COUNT"

# 1.5 Verify specific operators present (spot check)
OPS_MATCH=$(echo "$TASKS1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
op_items = {t['testItem'].split('/')[0] for t in d['data'] if t.get('testSubject')=='OPERATOR'}
expected = {'MatMul','Conv2D','Softmax','ReLU','GELU','SiLU','LayerNorm','BatchNorm','Attention','ScaledDotProduct','Add','Mul','Transpose','Gather','Embedding','Linear'}
print(expected == op_items)
" 2>/dev/null || echo "False")
assert_true "1.5 Operator testItems match template configJson operators exactly" "$OPS_MATCH"

# 1.6 Verify specific models present
MODELS_MATCH=$(echo "$TASKS1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
model_items = {t['testItem'].split('/')[0] for t in d['data'] if t.get('testSubject')=='MODEL'}
expected = {'MLP-Small','ResNet-50','BERT-Base'}
print(expected == model_items)
" 2>/dev/null || echo "False")
assert_true "1.6 Model testItems match template configJson models exactly" "$MODELS_MATCH"

# 1.7 Verify specific training items present (#465)
TRAINING_MATCH=$(echo "$TASKS1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
train_items = {t['testItem'].split('/')[0] for t in d['data'] if t.get('testSubject')=='TRAINING'}
expected = {'MLP-Small-Train','ResNet-50-Finetune'}
print(expected == train_items)
" 2>/dev/null || echo "False")
assert_true "1.7 Training testItems match template configJson training exactly" "$TRAINING_MATCH"

# 1.8 All training tasks have evalType=TRAINING
TRAIN_EVAL_TYPE=$(echo "$TASKS1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(all(t.get('evalType')=='TRAINING' for t in d['data'] if t.get('testSubject')=='TRAINING'))
" 2>/dev/null || echo "False")
assert_true "1.8 Training tasks have evalType=TRAINING" "$TRAIN_EVAL_TYPE"

echo ""

# ============================================================================
# TEST 2: "芯片快速验证" (id=95)
# configJson has: 5 operators + 1 model + 1 training = 7 items
# ============================================================================
echo "━━━ Test 2: 芯片快速验证 (template 95) — 5 ops + 1 model + 1 training = 7 tasks ━━━"

create_and_split "CI-Split-Quick-$TS" 95
PLAN2_ID=$_PLAN_ID
TASKS2=$_TASKS_RESP

# 2.1 Total task count = 7
TASK_COUNT=$(echo "$TASKS2" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['data']))" 2>/dev/null || echo "0")
assert_equals "2.1 Total tasks = 7 (5 ops + 1 model + 1 training)" "7" "$TASK_COUNT"

# 2.2 Operator tasks = 5
OP_COUNT=$(echo "$TASKS2" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='OPERATOR'))
" 2>/dev/null || echo "0")
assert_equals "2.2 Operator tasks = 5" "5" "$OP_COUNT"

# 2.3 Model tasks = 1
MODEL_COUNT=$(echo "$TASKS2" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='MODEL'))
" 2>/dev/null || echo "0")
assert_equals "2.3 Model tasks = 1" "1" "$MODEL_COUNT"

# 2.4 Training tasks = 1 (#465)
TRAIN_COUNT=$(echo "$TASKS2" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='TRAINING'))
" 2>/dev/null || echo "0")
assert_equals "2.4 Training tasks = 1" "1" "$TRAIN_COUNT"

# 2.5 Verify exact operators
OPS_MATCH=$(echo "$TASKS2" | python3 -c "
import json,sys
d=json.load(sys.stdin)
op_items = {t['testItem'].split('/')[0] for t in d['data'] if t.get('testSubject')=='OPERATOR'}
expected = {'MatMul','Conv2D','Softmax','ReLU','LayerNorm'}
print(expected == op_items)
" 2>/dev/null || echo "False")
assert_true "2.5 Operators match: MatMul,Conv2D,Softmax,ReLU,LayerNorm" "$OPS_MATCH"

# 2.6 Verify model = MLP-Small
MODEL_MATCH=$(echo "$TASKS2" | python3 -c "
import json,sys
d=json.load(sys.stdin)
model_items = {t['testItem'].split('/')[0] for t in d['data'] if t.get('testSubject')=='MODEL'}
print(model_items == {'MLP-Small'})
" 2>/dev/null || echo "False")
assert_true "2.6 Model = MLP-Small" "$MODEL_MATCH"

# 2.7 Verify training = MLP-Small-Train
TRAIN_MATCH=$(echo "$TASKS2" | python3 -c "
import json,sys
d=json.load(sys.stdin)
train_items = {t['testItem'].split('/')[0] for t in d['data'] if t.get('testSubject')=='TRAINING'}
print(train_items == {'MLP-Small-Train'})
" 2>/dev/null || echo "False")
assert_true "2.7 Training = MLP-Small-Train" "$TRAIN_MATCH"

echo ""

# ============================================================================
# TEST 3: "算子性能基准测试" (id=3)
# configJson has: 10 operators + 0 models (empty array) + 0 training = 10 items
# ============================================================================
echo "━━━ Test 3: 算子性能基准测试 (template 3) — 10 ops only ━━━"

create_and_split "CI-Split-OpBenchmark-$TS" 3
PLAN3_ID=$_PLAN_ID
TASKS3=$_TASKS_RESP

# 3.1 Total task count = 10
TASK_COUNT=$(echo "$TASKS3" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['data']))" 2>/dev/null || echo "0")
assert_equals "3.1 Total tasks = 10 (10 operators, no models)" "10" "$TASK_COUNT"

# 3.2 All tasks are OPERATOR
OP_COUNT=$(echo "$TASKS3" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='OPERATOR'))
" 2>/dev/null || echo "0")
assert_equals "3.2 All tasks are OPERATOR (10)" "10" "$OP_COUNT"

# 3.3 No model tasks
MODEL_COUNT=$(echo "$TASKS3" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='MODEL'))
" 2>/dev/null || echo "0")
assert_equals "3.3 No MODEL tasks" "0" "$MODEL_COUNT"

# 3.4 No training tasks
TRAIN_COUNT=$(echo "$TASKS3" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='TRAINING'))
" 2>/dev/null || echo "0")
assert_equals "3.4 No TRAINING tasks" "0" "$TRAIN_COUNT"

# 3.5 Verify exact operators
OPS_MATCH=$(echo "$TASKS3" | python3 -c "
import json,sys
d=json.load(sys.stdin)
op_items = {t['testItem'].split('/')[0] for t in d['data'] if t.get('testSubject')=='OPERATOR'}
expected = {'MatMul','Conv2D','Softmax','ReLU','GELU','BatchNorm','LayerNorm','Attention','Linear','Transpose'}
print(expected == op_items)
" 2>/dev/null || echo "False")
assert_true "3.5 Exact operators match template configJson" "$OPS_MATCH"

echo ""

# ============================================================================
# TEST 4: selectedItems filter (#412) — select a subset
# Use template 94 (21 items), but only select 3 specific items
# ============================================================================
echo "━━━ Test 4: selectedItems filter (#412) — partial selection ━━━"

# Select only: op-MatMul-X, model-MLP-Small-X, training-MLP-Small-Train-X
# The key format is: prefix-name-index (index varies per build)
# We use a trick: include specific items that we know exist
SELECTED=',"selectedItems":["op-MatMul-1","model-MLP-Small-18","training-MLP-Small-Train-20"]'
create_and_split "CI-Split-Selected-$TS" 94 "$SELECTED"
PLAN4_ID=$_PLAN_ID
TASKS4=$_TASKS_RESP

# 4.1 Should have exactly 3 tasks (filtered from 21)
TASK_COUNT=$(echo "$TASKS4" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['data']))" 2>/dev/null || echo "0")
assert_equals "4.1 Filtered tasks = 3 (1 op + 1 model + 1 training)" "3" "$TASK_COUNT"

# 4.2 Check the op task is MatMul
OP_ITEM=$(echo "$TASKS4" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ops = [t for t in d['data'] if t.get('testSubject')=='OPERATOR']
print(ops[0]['testItem'].split('/')[0] if ops else 'NONE')
" 2>/dev/null || echo "NONE")
assert_equals "4.2 Filtered op = MatMul" "MatMul" "$OP_ITEM"

# 4.3 Check the model task is MLP-Small
MODEL_ITEM=$(echo "$TASKS4" | python3 -c "
import json,sys
d=json.load(sys.stdin)
models = [t for t in d['data'] if t.get('testSubject')=='MODEL']
print(models[0]['testItem'].split('/')[0] if models else 'NONE')
" 2>/dev/null || echo "NONE")
assert_equals "4.3 Filtered model = MLP-Small" "MLP-Small" "$MODEL_ITEM"

# 4.4 Check the training task is MLP-Small-Train
TRAIN_ITEM=$(echo "$TASKS4" | python3 -c "
import json,sys
d=json.load(sys.stdin)
trains = [t for t in d['data'] if t.get('testSubject')=='TRAINING']
print(trains[0]['testItem'].split('/')[0] if trains else 'NONE')
" 2>/dev/null || echo "NONE")
assert_equals "4.4 Filtered training = MLP-Small-Train" "MLP-Small-Train" "$TRAIN_ITEM"

echo ""

# ============================================================================
# TEST 5: selectedItems with root items (select all ops, specific model)
# ============================================================================
echo "━━━ Test 5: selectedItems root items — select all ops + specific model ━━━"

SELECTED5=',"selectedItems":["op-root-0","model-MLP-Small-18"]'
create_and_split "CI-Split-RootSel-$TS" 94 "$SELECTED5"
PLAN5_ID=$_PLAN_ID
TASKS5=$_TASKS_RESP

# 5.1 Should have 16 ops + 1 model = 17 (training not selected → excluded)
TASK_COUNT=$(echo "$TASKS5" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['data']))" 2>/dev/null || echo "0")
assert_equals "5.1 Root-selected tasks = 17 (16 ops + 1 model, no training)" "17" "$TASK_COUNT"

# 5.2 All 16 operators present
OP_COUNT=$(echo "$TASKS5" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='OPERATOR'))
" 2>/dev/null || echo "0")
assert_equals "5.2 All 16 operators kept (root selected)" "16" "$OP_COUNT"

# 5.3 Only 1 model
MODEL_COUNT=$(echo "$TASKS5" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='MODEL'))
" 2>/dev/null || echo "0")
assert_equals "5.3 Only 1 model (specific selection)" "1" "$MODEL_COUNT"

# 5.4 No training (not selected)
TRAIN_COUNT=$(echo "$TASKS5" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='TRAINING'))
" 2>/dev/null || echo "0")
assert_equals "5.4 No training (not in selectedItems)" "0" "$TRAIN_COUNT"

echo ""

# ============================================================================
# TEST 6: Template without templateId falls back to preset
# ============================================================================
echo "━━━ Test 6: No templateId → falls back to preset splitting ━━━"

# Create plan WITHOUT templateId in evalConfig → should use QUICK preset
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/plans" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"chipId\":$CHIP_ID,\"name\":\"CI-Split-NoTemplate-$TS\",\"evalConfig\":\"{\\\"preset\\\":\\\"QUICK\\\"}\"}")
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
PLAN6_ID=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
CLEANUP_PLAN_IDS="$CLEANUP_PLAN_IDS $PLAN6_ID"

# Start plan
curl -s -o /dev/null -X PUT "$API_BASE/plans/$PLAN6_ID/start" \
  -H "Authorization: Bearer $TOKEN"

TASKS6=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/plans/$PLAN6_ID/tasks")

# 6.1 Should use QUICK preset: 5 ops + 4 models = 9
TASK_COUNT=$(echo "$TASKS6" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['data']))" 2>/dev/null || echo "0")
assert_equals "6.1 No templateId → QUICK preset = 9 tasks" "9" "$TASK_COUNT"

# 6.2 No training tasks (preset doesn't create training)
TRAIN_COUNT=$(echo "$TASKS6" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='TRAINING'))
" 2>/dev/null || echo "0")
assert_equals "6.2 Preset mode has no TRAINING tasks" "0" "$TRAIN_COUNT"

echo ""

# ============================================================================
# TEST 7: Template with only models (no operators, no training)
# "GPT-2 Small 标准推理评测" (id=1): 0 operators + 1 model = 1 item
# ============================================================================
echo "━━━ Test 7: Model-only template (id=1) ━━━"

create_and_split "CI-Split-ModelOnly-$TS" 1
PLAN7_ID=$_PLAN_ID
TASKS7=$_TASKS_RESP

# 7.1 Total tasks = 1 (only GPT2-Small model)
TASK_COUNT=$(echo "$TASKS7" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['data']))" 2>/dev/null || echo "0")
assert_equals "7.1 Model-only template → 1 task" "1" "$TASK_COUNT"

# 7.2 Task is MODEL type
SUBJECT=$(echo "$TASKS7" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d['data'][0]['testSubject'] if d['data'] else 'NONE')
" 2>/dev/null || echo "NONE")
assert_equals "7.2 Task subject = MODEL" "MODEL" "$SUBJECT"

# 7.3 testItem = GPT2-Small
ITEM=$(echo "$TASKS7" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d['data'][0]['testItem'].split('/')[0] if d['data'] else 'NONE')
" 2>/dev/null || echo "NONE")
assert_equals "7.3 testItem = GPT2-Small" "GPT2-Small" "$ITEM"

echo ""

# ============================================================================
# TEST 8: "芯片精度专项" (id=96) — has operators and models but no training
# configJson: 5 operators + 2 models + 0 training = 7 items
# ============================================================================
echo "━━━ Test 8: 芯片精度专项 (template 96) — 5 ops + 2 models, no training ━━━"

create_and_split "CI-Split-Accuracy-$TS" 96
PLAN8_ID=$_PLAN_ID
TASKS8=$_TASKS_RESP

# 8.1 Total = 7
TASK_COUNT=$(echo "$TASKS8" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['data']))" 2>/dev/null || echo "0")
assert_equals "8.1 Total tasks = 7 (5 ops + 2 models)" "7" "$TASK_COUNT"

# 8.2 No training
TRAIN_COUNT=$(echo "$TASKS8" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('testSubject')=='TRAINING'))
" 2>/dev/null || echo "0")
assert_equals "8.2 No training tasks (template has no training)" "0" "$TRAIN_COUNT"

echo ""

# ============================================================================
# TEST 9: Run specs data (#463) — verify /api/run-specs returns data
# ============================================================================
echo "━━━ Test 9: Run specs data (#463) ━━━"

SPECS_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/run-specs")

# 9.1 Returns 8 specs
SPEC_COUNT=$(echo "$SPECS_RESP" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['data']))" 2>/dev/null || echo "0")
assert_true "9.1 /api/run-specs returns >= 8 specs" "$([ "$SPEC_COUNT" -ge 8 ] && echo true || echo false)"

# 9.2 Has GPU category
GPU_SPECS=$(echo "$SPECS_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for s in d['data'] if s.get('category')=='gpu'))
" 2>/dev/null || echo "0")
assert_true "9.2 Has GPU run specs" "$([ "$GPU_SPECS" -ge 4 ] && echo true || echo false)"

# 9.3 Has CPU category
CPU_SPECS=$(echo "$SPECS_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for s in d['data'] if s.get('category')=='cpu'))
" 2>/dev/null || echo "0")
assert_true "9.3 Has CPU run specs" "$([ "$CPU_SPECS" -ge 2 ] && echo true || echo false)"

# 9.4 Has multi category
MULTI_SPECS=$(echo "$SPECS_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(sum(1 for s in d['data'] if s.get('category')=='multi'))
" 2>/dev/null || echo "0")
assert_true "9.4 Has multi-node run specs" "$([ "$MULTI_SPECS" -ge 2 ] && echo true || echo false)"

echo ""

# ============================================================================
# CLEANUP
# ============================================================================
echo "━━━ Cleanup ━━━"

for id in $CLEANUP_PLAN_IDS; do
  [ -n "$id" ] && [ "$id" != "None" ] && \
    curl -s -o /dev/null -X PUT -H "Authorization: Bearer $TOKEN" "$API_BASE/plans/$id/cancel" 2>/dev/null
done

for id in $CLEANUP_CHIP_IDS; do
  [ -n "$id" ] && [ "$id" != "None" ] && \
    curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN" "$API_BASE/chips/$id" 2>/dev/null
done

# Run DB cleanup
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
  echo ""
  echo "❌ FAILED — Template → Task splitting chain is broken!"
  exit 1
fi

echo ""
echo "✅ All template → task splitting tests passed!"
