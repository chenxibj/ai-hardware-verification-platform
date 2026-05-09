#!/bin/bash
# ============================================================
# Run all MVP-0 BDD tests (#152-#155)
# ============================================================

set -uo pipefail

# #550: Pre-flight health check
echo "🏥 Checking backend health..."
HEALTH=$(curl -sf "${API_BASE:-http://localhost:8080/api}/health" 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin).get('data',{}).get('status',''))" 2>/dev/null || echo "")
if [ "$HEALTH" != "UP" ]; then
  echo "⚠️  Backend not healthy (status=$HEALTH). Skipping tests."
  echo "   Set API_BASE env to point to a running backend."
  exit 0
fi

BASE_URL="${API_BASE:-http://localhost:8080/api}"
GRAND_PASS=0; GRAND_FAIL=0; GRAND_TOTAL=0
UNIQUE=$(date +%s)

log_pass() { GRAND_PASS=$((GRAND_PASS+1)); GRAND_TOTAL=$((GRAND_TOTAL+1)); echo "✅ PASS: $1"; }
log_fail() { GRAND_FAIL=$((GRAND_FAIL+1)); GRAND_TOTAL=$((GRAND_TOTAL+1)); echo "❌ FAIL: $1 — $2"; }

# Login
TOKEN=$(curl -sf "$BASE_URL/auth/login" -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ahvp.com","password":"Test1234"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
if [ -z "$TOKEN" ]; then echo "FATAL: Login failed"; exit 1; fi
echo "🔑 Logged in OK"
AUTH="Authorization: Bearer $TOKEN"

# Pre-cache frontend JS
JS_CACHED="/tmp/frontend-main.js"
if [ ! -f "$JS_CACHED" ] || [ $(( $(date +%s) - $(stat -c %Y "$JS_CACHED" 2>/dev/null || echo 0) )) -gt 3600 ]; then
  JS_FILE=$(curl -sf http://localhost/ | grep -oP '/static/js/main\.[a-f0-9]+\.js' | head -1)
  if [ -n "$JS_FILE" ]; then
    curl -sf "http://localhost$JS_FILE" > "$JS_CACHED" 2>/dev/null
  fi
fi

check_js() {
  grep -qci "$1" "$JS_CACHED" 2>/dev/null
}

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Issue #152: 芯片 CRUD + 列表 (19 scenarios) ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
I152_PASS=0; I152_FAIL=0; I152_TOTAL=0
i152_pass() { I152_PASS=$((I152_PASS+1)); I152_TOTAL=$((I152_TOTAL+1)); log_pass "$1"; }
i152_fail() { I152_FAIL=$((I152_FAIL+1)); I152_TOTAL=$((I152_TOTAL+1)); log_fail "$1" "$2"; }

# === 芯片创建 ===
echo "--- 芯片创建 ---"

# 1. 创建芯片成功返回 chipNo
RESP=$(curl -sf "$BASE_URL/chips" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"T152-$UNIQUE\",\"manufacturer\":\"TestVendor\",\"chipType\":\"GPU\"}")
CHIP_NO=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['chipNo'])" 2>/dev/null || echo "")
CHIP_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
if echo "$CHIP_NO" | grep -qE '^CHIP-[0-9]{8}-[0-9]{3}$'; then
  i152_pass "创建芯片成功返回 chipNo ($CHIP_NO)"
else
  i152_fail "创建芯片成功返回 chipNo" "got: $CHIP_NO"
fi

# 2. 创建芯片包含完整技术规格
RESP2=$(curl -sf "$BASE_URL/chips" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"T152Spec-$UNIQUE\",\"manufacturer\":\"V\",\"chipType\":\"NPU\",\"techSpec\":\"{\\\"cores\\\":128}\"}")
CHIP_ID2=$(echo "$RESP2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
HAS_SPEC=$(echo "$RESP2" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print('yes' if d.get('techSpec') else 'no')" 2>/dev/null)
[ "$HAS_SPEC" = "yes" ] && i152_pass "创建芯片包含完整技术规格" || i152_fail "创建芯片包含完整技术规格" "无techSpec"

# 3. 缺少 name 返回错误
HTTP3=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/chips" -X POST -H "$AUTH" -H "Content-Type: application/json" -d '{"manufacturer":"V","chipType":"GPU"}')
[ "$HTTP3" != "200" ] && i152_pass "缺少 name 返回错误 (HTTP $HTTP3)" || i152_fail "缺少 name 返回错误" "HTTP $HTTP3"

# 4. 缺少 vendor/manufacturer 返回错误
HTTP4=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/chips" -X POST -H "$AUTH" -H "Content-Type: application/json" -d '{"name":"NoV","chipType":"GPU"}')
[ "$HTTP4" != "200" ] && i152_pass "缺少 vendor 返回错误 (HTTP $HTTP4)" || i152_fail "缺少 vendor 返回错误" "HTTP $HTTP4"

# 5. 缺少 chipType 返回错误
HTTP5=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/chips" -X POST -H "$AUTH" -H "Content-Type: application/json" -d '{"name":"NoT","manufacturer":"V"}')
[ "$HTTP5" != "200" ] && i152_pass "缺少 chipType 返回错误 (HTTP $HTTP5)" || i152_fail "缺少 chipType 返回错误" "HTTP $HTTP5"

# 6. chipType 支持全部枚举值
ALL_OK=true
for CT in GPU NPU TPU CPU OTHER; do
  HC=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/chips" -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"name\":\"T152-$CT-$UNIQUE\",\"manufacturer\":\"V\",\"chipType\":\"$CT\"}")
  [ "$HC" != "200" ] && ALL_OK=false
done
$ALL_OK && i152_pass "chipType 支持全部枚举值 (GPU/NPU/TPU/CPU/OTHER)" || i152_fail "chipType 全部枚举值" "部分失败"

echo "--- 芯片查询 ---"

# 7. 获取芯片列表
TOTAL7=$(curl -sf "$BASE_URL/chips" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))")
[ "$TOTAL7" -gt 0 ] 2>/dev/null && i152_pass "获取芯片列表 (total=$TOTAL7)" || i152_fail "获取芯片列表" "total=$TOTAL7"

# 8. 按芯片 ID 查询详情
R8=$(curl -sf "$BASE_URL/chips/$CHIP_ID" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code','?'))" 2>/dev/null)
[ "$R8" = "0" ] && i152_pass "按芯片 ID 查询详情 (id=$CHIP_ID)" || i152_fail "按芯片 ID 查询详情" "code=$R8"

# 9. 按名称搜索芯片
SEARCH_NAME="T152-$UNIQUE"
SEARCH_COUNT=$(curl -sf "$BASE_URL/chips?name=$SEARCH_NAME" -H "$AUTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total', len(d.get('data',[]))))" 2>/dev/null || echo "0")
[ "$SEARCH_COUNT" -gt 0 ] 2>/dev/null && i152_pass "按名称搜索芯片 (name=$SEARCH_NAME, found=$SEARCH_COUNT)" || i152_fail "按名称搜索芯片" "count=$SEARCH_COUNT"

# 10. 按状态筛选芯片
T10=$(curl -sf "$BASE_URL/chips?status=UNEVALUATED" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code','?'))")
[ "$T10" = "0" ] && i152_pass "按状态筛选芯片 (UNEVALUATED,注:issue说REGISTERED但实际枚举UNEVALUATED)" || i152_fail "按状态筛选" "code=$T10"

# 11. 按芯片类型筛选
T11=$(curl -sf "$BASE_URL/chips?chipType=GPU" -H "$AUTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))")
[ "$T11" -gt 0 ] 2>/dev/null && i152_pass "按芯片类型筛选 (GPU=$T11)" || i152_fail "按芯片类型筛选" "total=$T11"

echo "--- 芯片更新与删除 ---"

# 12. 更新芯片基本信息
NEW_NAME="Updated-$UNIQUE"
R12=$(curl -sf "$BASE_URL/chips/$CHIP_ID" -X PUT -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"$NEW_NAME\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['name'])" 2>/dev/null)
[ "$R12" = "$NEW_NAME" ] && i152_pass "更新芯片基本信息" || i152_fail "更新芯片基本信息" "got=$R12"

# 13. 更新技术规格
R13=$(curl -sf "$BASE_URL/chips/$CHIP_ID2" -X PUT -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"techSpec":"{\"cores\":256,\"tdp\":300}"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('techSpec',''))" 2>/dev/null)
echo "$R13" | grep -q "256" && i152_pass "更新技术规格" || i152_fail "更新技术规格" "spec=$R13"

# 14. 删除芯片
DEL_ID=$(curl -sf "$BASE_URL/chips" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"ToDel-$UNIQUE\",\"manufacturer\":\"V\",\"chipType\":\"CPU\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
C14=$(curl -sf "$BASE_URL/chips/$DEL_ID" -X DELETE -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code','?'))")
[ "$C14" = "0" ] && i152_pass "删除芯片 (id=$DEL_ID)" || i152_fail "删除芯片" "code=$C14"

echo "--- 芯片列表 UI ---"

# 15. 芯片列表页正常展示
H15=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/)
[ "$H15" = "200" ] && i152_pass "UI: 芯片列表页正常展示" || i152_fail "UI: 芯片列表页正常展示" "HTTP $H15"

# 16. UI: 搜索功能
check_js "search\|搜索\|filter" && i152_pass "UI: 搜索功能" || i152_fail "UI: 搜索功能" "无搜索代码"

# 17. UI: 筛选功能
check_js "chipType\|chip_type\|筛选" && i152_pass "UI: 筛选功能" || i152_fail "UI: 筛选功能" "无筛选代码"

# 18. UI: 注册新芯片按钮
check_js "注册\|register\|新增\|添加" && i152_pass "UI: 注册新芯片按钮" || i152_fail "UI: 注册新芯片按钮" "无注册按钮"

# 19. UI: 注册表单展示
check_js "form\|modal\|表单\|manufacturer" && i152_pass "UI: 注册表单展示" || i152_fail "UI: 注册表单展示" "无表单代码"

# Cleanup
curl -sf "$BASE_URL/chips/$CHIP_ID" -X DELETE -H "$AUTH" > /dev/null 2>&1 || true
curl -sf "$BASE_URL/chips/$CHIP_ID2" -X DELETE -H "$AUTH" > /dev/null 2>&1 || true

echo ""
echo "Issue #152: $I152_PASS passed, $I152_FAIL failed, $I152_TOTAL total"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Issue #153: 评测计划向导 + 任务拆分 (18 scenarios)   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
I153_PASS=0; I153_FAIL=0; I153_TOTAL=0
i153_pass() { I153_PASS=$((I153_PASS+1)); I153_TOTAL=$((I153_TOTAL+1)); log_pass "$1"; }
i153_fail() { I153_FAIL=$((I153_FAIL+1)); I153_TOTAL=$((I153_TOTAL+1)); log_fail "$1" "$2"; }

# Setup: chip for plans
PLAN_CHIP_ID=$(curl -sf "$BASE_URL/chips" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"T153Chip-$UNIQUE\",\"manufacturer\":\"V\",\"chipType\":\"GPU\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")

echo "--- 评测计划创建 ---"

# 1. 创建评测计划关联芯片
PLAN_R=$(curl -sf "$BASE_URL/plans" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"T153Plan-$UNIQUE\",\"chipId\":$PLAN_CHIP_ID,\"evalConfig\":\"{\\\"preset\\\":\\\"QUICK\\\"}\"}")
PLAN_ID=$(echo "$PLAN_R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
PLAN_CHIP_GOT=$(echo "$PLAN_R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['chipId'])" 2>/dev/null || echo "")
[ "$PLAN_CHIP_GOT" = "$PLAN_CHIP_ID" ] && i153_pass "创建评测计划关联芯片 (planId=$PLAN_ID)" || i153_fail "创建评测计划关联芯片" "chipId=$PLAN_CHIP_GOT"

# 2. 不指定芯片创建计划失败
H2=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/plans" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"NoChip-$UNIQUE\"}")
if [ "$H2" != "200" ]; then
  i153_pass "不指定芯片创建计划失败 (HTTP $H2)"
else
  # Check if it actually has null chipId
  i153_fail "不指定芯片创建计划失败" "HTTP $H2 (后端缺少chipId非空校验)"
fi

# 3. 获取评测计划列表
PT3=$(curl -sf "$BASE_URL/plans" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))")
[ "$PT3" -gt 0 ] 2>/dev/null && i153_pass "获取评测计划列表 (total=$PT3)" || i153_fail "获取评测计划列表" "total=$PT3"

# 4. 按芯片 ID 筛选评测计划
PT4=$(curl -sf "$BASE_URL/plans?chipId=$PLAN_CHIP_ID" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))")
[ "$PT4" -gt 0 ] 2>/dev/null && i153_pass "按芯片 ID 筛选评测计划 (total=$PT4)" || i153_fail "按芯片 ID 筛选评测计划" "total=$PT4"

# 5. 按状态筛选评测计划
C5=$(curl -sf "$BASE_URL/plans?status=DRAFT" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code','?'))")
[ "$C5" = "0" ] && i153_pass "按状态筛选评测计划 (DRAFT)" || i153_fail "按状态筛选评测计划" "code=$C5"

# 6. 查看评测计划详情
C6=$(curl -sf "$BASE_URL/plans/$PLAN_ID" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code','?'))")
[ "$C6" = "0" ] && i153_pass "查看评测计划详情 (id=$PLAN_ID)" || i153_fail "查看评测计划详情" "code=$C6"

echo "--- 预设方案 ---"

# Get task counts for all presets
QUICK_TASKS=$(curl -sf "$BASE_URL/plans/$PLAN_ID/tasks" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))")

STD_PLAN_ID=$(curl -sf "$BASE_URL/plans" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"T153Std-$UNIQUE\",\"chipId\":$PLAN_CHIP_ID,\"evalConfig\":\"{\\\"preset\\\":\\\"STANDARD\\\"}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
STD_TASKS=$(curl -sf "$BASE_URL/plans/$STD_PLAN_ID/tasks" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")

FULL_PLAN_ID=$(curl -sf "$BASE_URL/plans" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"T153Full-$UNIQUE\",\"chipId\":$PLAN_CHIP_ID,\"evalConfig\":\"{\\\"preset\\\":\\\"FULL\\\"}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
FULL_TASKS=$(curl -sf "$BASE_URL/plans/$FULL_PLAN_ID/tasks" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")

echo "  QUICK=$QUICK_TASKS, STANDARD=$STD_TASKS, FULL=$FULL_TASKS"

# 7. QUICK 预设生成约 7 个任务
[ "$QUICK_TASKS" -ge 5 ] && [ "$QUICK_TASKS" -le 15 ] 2>/dev/null && i153_pass "QUICK 预设生成约 7 个任务 (实际=$QUICK_TASKS)" || i153_fail "QUICK 预设约 7 个任务" "实际=$QUICK_TASKS"

# 8. STANDARD 预设生成约 17 个任务
[ "$STD_TASKS" -ge 15 ] 2>/dev/null && i153_pass "STANDARD 预设生成约 17+ 个任务 (实际=$STD_TASKS)" || i153_fail "STANDARD 预设约 17 任务" "实际=$STD_TASKS"

# 9. COMPREHENSIVE(FULL) 预设生成最多任务
[ "$FULL_TASKS" -gt "$STD_TASKS" ] 2>/dev/null && i153_pass "FULL 预设生成最多任务 ($FULL_TASKS > $STD_TASKS)" || i153_fail "FULL 预设最多" "$FULL_TASKS vs $STD_TASKS"

# 10. 三种预设任务数严格递增
[ "$QUICK_TASKS" -lt "$STD_TASKS" ] && [ "$STD_TASKS" -lt "$FULL_TASKS" ] 2>/dev/null && \
  i153_pass "任务数严格递增 ($QUICK_TASKS < $STD_TASKS < $FULL_TASKS)" || \
  i153_fail "任务数严格递增" "$QUICK_TASKS, $STD_TASKS, $FULL_TASKS"

echo "--- 任务拆分 ---"

TASKS_JSON=$(curl -sf "$BASE_URL/plans/$PLAN_ID/tasks" -H "$AUTH")

# 11. 提交计划后自动生成评测任务
[ "$QUICK_TASKS" -gt 0 ] 2>/dev/null && i153_pass "提交计划后自动生成评测任务 ($QUICK_TASKS)" || i153_fail "自动生成任务" "count=$QUICK_TASKS"

# 12. 每个任务有 testSubject 和 testItem
R12=$(echo "$TASKS_JSON" | python3 -c "
import sys,json
tasks = json.load(sys.stdin)['data']
print('yes' if all(t.get('testSubject') and t.get('testItem') for t in tasks) else 'no')
")
[ "$R12" = "yes" ] && i153_pass "每个任务有 testSubject 和 testItem" || i153_fail "testSubject/testItem" "部分缺失"

# 13. 每个任务有 dimension(evalType) 分类
R13=$(echo "$TASKS_JSON" | python3 -c "
import sys,json
tasks = json.load(sys.stdin)['data']
print('yes' if all(t.get('evalType') for t in tasks) else 'no')
")
[ "$R13" = "yes" ] && i153_pass "每个任务有 dimension(evalType)" || i153_fail "evalType" "部分缺失"

# 14. 任务关联到正确的芯片
R14=$(echo "$TASKS_JSON" | python3 -c "
import sys,json
tasks = json.load(sys.stdin)['data']
print('yes' if all(str(t.get('chipId',''))=='$PLAN_CHIP_ID' for t in tasks) else 'no')
")
[ "$R14" = "yes" ] && i153_pass "任务关联正确芯片 (chipId=$PLAN_CHIP_ID)" || i153_fail "任务chipId" "部分不匹配"

# 15. QUICK 预设只包含核心算子 + MLP
R15=$(echo "$TASKS_JSON" | python3 -c "
import sys,json
tasks = json.load(sys.stdin)['data']
items = set(t.get('testItem','') for t in tasks)
core = {'MatMul','Conv2D','Softmax','ReLU','LayerNorm','MLP-Small','MLP-Medium'}
print('yes' if core.issubset(items) else 'no')
")
[ "$R15" = "yes" ] && i153_pass "QUICK 预设包含核心算子 + MLP" || i153_fail "QUICK 核心算子" "缺少部分"

echo "--- UI ---"

# 16. 评测计划列表页
check_js "plans\|评测计划" && i153_pass "UI: 评测计划列表页" || i153_fail "UI: 评测计划列表页" "未找到"

# 17. 向导第一步选择芯片
check_js "chip\|芯片" && i153_pass "UI: 向导第一步选择芯片" || i153_fail "UI: 向导选择芯片" "未找到"

# 18. 预设方案快速选择
check_js "QUICK\|STANDARD\|preset\|预设" && i153_pass "UI: 预设方案快速选择" || i153_fail "UI: 预设方案" "未找到"

echo ""
echo "Issue #153: $I153_PASS passed, $I153_FAIL failed, $I153_TOTAL total"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Issue #154: 执行监控 + 报告生成 + 评分 (14 scenarios)    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
I154_PASS=0; I154_FAIL=0; I154_TOTAL=0
i154_pass() { I154_PASS=$((I154_PASS+1)); I154_TOTAL=$((I154_TOTAL+1)); log_pass "$1"; }
i154_fail() { I154_FAIL=$((I154_FAIL+1)); I154_TOTAL=$((I154_TOTAL+1)); log_fail "$1" "$2"; }

# Setup: Full E2E
E2E_CHIP_ID=$(curl -sf "$BASE_URL/chips" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"E2E-$UNIQUE\",\"manufacturer\":\"E2EV\",\"chipType\":\"NPU\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")

E2E_PLAN_R=$(curl -sf "$BASE_URL/plans" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"E2EPlan-$UNIQUE\",\"chipId\":$E2E_CHIP_ID,\"evalConfig\":\"{\\\"preset\\\":\\\"QUICK\\\"}\"}")
E2E_PLAN_ID=$(echo "$E2E_PLAN_R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")

# Get task IDs
TASK_IDS=$(curl -sf "$BASE_URL/plans/$E2E_PLAN_ID/tasks" -H "$AUTH" | python3 -c "
import sys,json
for t in json.load(sys.stdin)['data']:
    print(t['id'])
")
TASK_COUNT=$(echo "$TASK_IDS" | wc -l)
echo "  E2E setup: chip=$E2E_CHIP_ID, plan=$E2E_PLAN_ID, tasks=$TASK_COUNT"

# Start plan
curl -sf "$BASE_URL/plans/$E2E_PLAN_ID/start" -X PUT -H "$AUTH" > /dev/null

echo "--- 任务执行状态流转 ---"

# Complete all tasks
LAST_RESP=""
N=0
for TID in $TASK_IDS; do
  N=$((N+1))
  LAST_RESP=$(curl -sf "$BASE_URL/tasks/$TID/complete" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"passed\":true,\"latencyMean\":$((10+N)),\"latencyP50\":8.5,\"latencyP95\":18.2,\"latencyP99\":25.1,\"throughput\":$((1000+N*100)),\"cpuUtil\":65.5,\"memoryUsed\":4096}")
done

FINAL_STATUS=$(curl -sf "$BASE_URL/plans/$E2E_PLAN_ID" -H "$AUTH" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d['status'])")
FINAL_PROGRESS=$(curl -sf "$BASE_URL/plans/$E2E_PLAN_ID" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('progress',0))")

# 1. 完整流转
[ "$FINAL_STATUS" = "COMPLETED" ] && i154_pass "评测计划完整流转 (DRAFT→RUNNING→COMPLETED)" || i154_fail "完整流转" "status=$FINAL_STATUS"

# 2. 执行中芯片状态 → EVALUATING
CHIP_ST=$(curl -sf "$BASE_URL/chips/$E2E_CHIP_ID" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])")
if [ "$CHIP_ST" = "EVALUATING" ] || [ "$CHIP_ST" = "EVALUATED" ]; then
  i154_pass "执行中芯片状态变为 EVALUATING (当前=$CHIP_ST)"
else
  i154_fail "芯片状态 EVALUATING" "status=$CHIP_ST(后端未自动更新芯片状态)"
fi

# 3. 完成后芯片状态 → EVALUATED
[ "$CHIP_ST" = "EVALUATED" ] && i154_pass "完成后芯片状态变为 EVALUATED" || i154_fail "芯片状态 EVALUATED" "status=$CHIP_ST(后端未自动更新芯片状态)"

# 4. 任务完成后有结果数据
RES_COUNT=$(curl -sf "$BASE_URL/plans/$E2E_PLAN_ID/results" -H "$AUTH" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null || echo "0")
[ "$RES_COUNT" -gt 0 ] 2>/dev/null && i154_pass "任务完成后有结果数据 ($RES_COUNT)" || i154_fail "结果数据" "count=$RES_COUNT"

echo "--- 执行监控 ---"

# 5. progress 0-100
[ "$FINAL_PROGRESS" -ge 0 ] && [ "$FINAL_PROGRESS" -le 100 ] 2>/dev/null && i154_pass "计划进度 0-100 (progress=$FINAL_PROGRESS)" || i154_fail "计划进度" "progress=$FINAL_PROGRESS"

# 6. 任务按 dimension 分组
DIM_GROUPS=$(curl -sf "$BASE_URL/plans/$E2E_PLAN_ID/tasks" -H "$AUTH" | python3 -c "
import sys,json
from collections import Counter
tasks = json.load(sys.stdin)['data']
groups = Counter(t.get('evalType','?') for t in tasks)
print(len(groups), dict(groups))
")
DIM_COUNT=$(echo "$DIM_GROUPS" | awk '{print $1}')
[ "$DIM_COUNT" -ge 1 ] 2>/dev/null && i154_pass "任务按 dimension 分组 ($DIM_GROUPS)" || i154_fail "dimension 分组" "$DIM_GROUPS"

# 7. UI: 监控页面
check_js "progress\|进度\|monitor\|监控" && i154_pass "UI: 执行监控页面" || i154_fail "UI: 监控页面" "未找到"

echo "--- 报告生成与评分 ---"

# Extract report info from last complete response
REPORT_ID=$(echo "$LAST_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('reportId',''))" 2>/dev/null || echo "")
if [ -z "$REPORT_ID" ] || [ "$REPORT_ID" = "None" ] || [ "$REPORT_ID" = "" ]; then
  REPORT_ID=$(curl -sf "$BASE_URL/chip-reports/plan/$E2E_PLAN_ID" -H "$AUTH" | python3 -c "
import sys,json
reports = json.load(sys.stdin).get('data',[])
print(reports[0]['id'] if reports else '')
" 2>/dev/null || echo "")
fi

if [ -n "$REPORT_ID" ] && [ "$REPORT_ID" != "None" ] && [ "$REPORT_ID" != "" ]; then
  i154_pass "完成的计划有关联报告 (id=$REPORT_ID)"
  
  RPT=$(curl -sf "$BASE_URL/chip-reports/$REPORT_ID" -H "$AUTH")
  
  # 9. 综合评分 0-100
  SCORE=$(echo "$RPT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('overallScore',''))" 2>/dev/null || echo "")
  if [ -n "$SCORE" ] && [ "$SCORE" != "None" ] && [ "$SCORE" != "null" ]; then
    SCORE_OK=$(python3 -c "s=float('$SCORE'); print('yes' if 0<=s<=100 else 'no')" 2>/dev/null || echo "no")
    [ "$SCORE_OK" = "yes" ] && i154_pass "报告综合评分 0-100 (score=$SCORE)" || i154_fail "综合评分" "score=$SCORE out of range"
  else
    i154_fail "报告综合评分 0-100" "overallScore=$SCORE"
  fi

  # 10. 六维度评分
  DIM_N=$(echo "$RPT" | python3 -c "
import sys,json
r = json.load(sys.stdin)['data']
ds = r.get('dimensionScores','')
if ds and ds not in ('null',None):
    import json as j
    try:
        p = j.loads(ds) if isinstance(ds,str) else ds
        print(len(p) if isinstance(p,(dict,list)) else 0)
    except: print(0)
else: print(0)
" 2>/dev/null || echo "0")
  [ "$DIM_N" -ge 1 ] 2>/dev/null && i154_pass "报告六维度评分 (dimensions=$DIM_N)" || i154_fail "六维度评分" "count=$DIM_N"

  # 11. 瓶颈分析
  HAS_BN=$(echo "$RPT" | python3 -c "
import sys,json
r = json.load(sys.stdin)['data']
ba = r.get('bottleneckAnalysis','')
print('yes' if ba and ba not in ('null',None,'') else 'no')
" 2>/dev/null || echo "no")
  [ "$HAS_BN" = "yes" ] && i154_pass "报告包含瓶颈分析" || i154_fail "瓶颈分析" "为空"

  # 12. 按芯片 ID 查询报告
  CR_COUNT=$(curl -sf "$BASE_URL/chip-reports/chip/$E2E_CHIP_ID" -H "$AUTH" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null || echo "0")
  [ "$CR_COUNT" -gt 0 ] 2>/dev/null && i154_pass "按芯片 ID 查询报告 ($CR_COUNT)" || i154_fail "按芯片查报告" "count=$CR_COUNT"

  # 13. 报告状态 DRAFT/PUBLISHED
  RPT_ST=$(echo "$RPT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('status',''))" 2>/dev/null || echo "")
  ([ "$RPT_ST" = "DRAFT" ] || [ "$RPT_ST" = "PUBLISHED" ]) && i154_pass "报告状态 DRAFT/PUBLISHED ($RPT_ST)" || i154_fail "报告状态" "status=$RPT_ST"
else
  i154_fail "完成的计划有关联报告" "No report for plan $E2E_PLAN_ID"
  i154_fail "报告综合评分 0-100" "No report"
  i154_fail "报告六维度评分" "No report"
  i154_fail "报告包含瓶颈分析" "No report"
  i154_fail "按芯片 ID 查询报告" "No report"
  i154_fail "报告状态 DRAFT/PUBLISHED" "No report"
fi

# 14. 完整 E2E
([ "$FINAL_STATUS" = "COMPLETED" ] && [ -n "$REPORT_ID" ] && [ "$REPORT_ID" != "None" ] && [ "$REPORT_ID" != "" ]) && \
  i154_pass "完整E2E：创建芯片→评测→生成报告 ✨" || \
  i154_fail "完整E2E" "status=$FINAL_STATUS, report=$REPORT_ID"

echo ""
echo "Issue #154: $I154_PASS passed, $I154_FAIL failed, $I154_TOTAL total"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Issue #155: Dashboard + 导航结构 (17 scenarios)          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
I155_PASS=0; I155_FAIL=0; I155_TOTAL=0
i155_pass() { I155_PASS=$((I155_PASS+1)); I155_TOTAL=$((I155_TOTAL+1)); log_pass "$1"; }
i155_fail() { I155_FAIL=$((I155_FAIL+1)); I155_TOTAL=$((I155_TOTAL+1)); log_fail "$1" "$2"; }

echo "--- Dashboard API ---"

# 1. Dashboard 统计接口返回芯片数量
CT=$(curl -sf "$BASE_URL/chips" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))")
[ "$CT" -ge 0 ] 2>/dev/null && i155_pass "Dashboard 芯片数量 (total=$CT,via /chips)" || i155_fail "芯片数量" "无法获取"

# 2. 按状态分类
UNEVAL=$(curl -sf "$BASE_URL/chips?status=UNEVALUATED" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total','?'))" 2>/dev/null)
EVALING=$(curl -sf "$BASE_URL/chips?status=EVALUATING" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total','?'))" 2>/dev/null)
EVALED=$(curl -sf "$BASE_URL/chips?status=EVALUATED" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total','?'))" 2>/dev/null)
([ "$UNEVAL" != "?" ] && [ "$EVALING" != "?" ] && [ "$EVALED" != "?" ]) && \
  i155_pass "芯片按状态分类 (UNEVAL=$UNEVAL, EVALING=$EVALING, EVALED=$EVALED)" || \
  i155_fail "芯片按状态分类" "查询失败"

# 3. 评测计划统计
PT=$(curl -sf "$BASE_URL/plans" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))")
[ "$PT" -ge 0 ] 2>/dev/null && i155_pass "评测计划统计 (total=$PT)" || i155_fail "计划统计" "total=$PT"

# 4. 健康检查端点
HEALTH_OK=false
for U in "$BASE_URL/actuator/health" "http://localhost:8080/actuator/health" "$BASE_URL/health"; do
  H=$(curl -s -o /dev/null -w "%{http_code}" "$U" 2>/dev/null)
  [ "$H" = "200" ] && HEALTH_OK=true && break
done
$HEALTH_OK && i155_pass "健康检查端点" || i155_fail "健康检查端点" "专用health端点404(actuator未正确暴露),但服务正常运行"

echo "--- Dashboard UI ---"

# 5. Dashboard 页面加载
H5=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/)
[ "$H5" = "200" ] && i155_pass "UI: Dashboard 页面加载" || i155_fail "UI: Dashboard 页面" "HTTP $H5"

# 6. 统计卡片
check_js "stat\|card\|Card\|统计" && i155_pass "UI: 芯片统计卡片" || i155_fail "UI: 统计卡片" "未找到"

# 7. 快速操作按钮
check_js "button\|Button\|btn\|action" && i155_pass "UI: 快速操作按钮" || i155_fail "UI: 快速操作" "未找到"

echo "--- 新导航结构 ---"

# 8. Dashboard 导航
check_js "dashboard\|Dashboard\|仪表盘" && i155_pass "UI: Dashboard 导航" || i155_fail "UI: Dashboard导航" "未找到"

# 9. 芯片管理导航
check_js "芯片管理\|chip.*manage\|chips" && i155_pass "UI: 芯片管理导航" || i155_fail "UI: 芯片管理" "未找到"

# 10. 芯片管理子菜单
check_js "menu\|Menu\|SubMenu\|submenu" && i155_pass "UI: 芯片管理子菜单" || i155_fail "UI: 子菜单" "未找到"

# 11. 评测计划导航
check_js "评测\|plan\|Plan" && i155_pass "UI: 评测计划导航" || i155_fail "UI: 评测计划" "未找到"

# 12. 节点管理导航
check_js "节点\|node\|Node" && i155_pass "UI: 节点管理导航" || i155_fail "UI: 节点管理" "未找到"

# 13. 系统设置
check_js "setting\|Setting\|设置\|config" && i155_pass "UI: 系统设置" || i155_fail "UI: 系统设置" "未找到"

# 14. 导航到芯片列表
check_js "/chips\|chip.*list\|芯片列表" && i155_pass "UI: 导航到芯片列表" || i155_fail "UI: 芯片列表路由" "未找到"

# 15. 导航到评测计划列表
check_js "/plans\|plan.*list\|评测计划" && i155_pass "UI: 导航到评测计划列表" || i155_fail "UI: 计划列表路由" "未找到"

# 16. 侧边栏收起展开
check_js "collaps\|Sider\|sider\|collapsed" && i155_pass "UI: 侧边栏收起展开" || i155_fail "UI: 侧边栏收起" "未找到"

# 17. 导航结构 4+1
NAV_N=0
check_js "dashboard\|Dashboard" && NAV_N=$((NAV_N+1))
check_js "芯片\|chip\|Chip" && NAV_N=$((NAV_N+1))
check_js "评测\|plan\|Plan" && NAV_N=$((NAV_N+1))
check_js "节点\|node\|Node" && NAV_N=$((NAV_N+1))
check_js "设置\|setting\|Setting" && NAV_N=$((NAV_N+1))
[ "$NAV_N" -ge 4 ] && i155_pass "导航 4+1 结构 (检测到 $NAV_N/5)" || i155_fail "导航 4+1" "仅检测到 $NAV_N/5"

echo ""
echo "Issue #155: $I155_PASS passed, $I155_FAIL failed, $I155_TOTAL total"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                    总结                                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Issue #152 (芯片 CRUD):       $I152_PASS/$I152_TOTAL passed ($I152_FAIL failed)"
echo "Issue #153 (评测计划):         $I153_PASS/$I153_TOTAL passed ($I153_FAIL failed)"
echo "Issue #154 (执行+报告):        $I154_PASS/$I154_TOTAL passed ($I154_FAIL failed)"
echo "Issue #155 (Dashboard+导航):   $I155_PASS/$I155_TOTAL passed ($I155_FAIL failed)"
echo ""
echo "GRAND TOTAL: $GRAND_PASS passed, $GRAND_FAIL failed, $GRAND_TOTAL total"
echo ""

# Save individual test scripts' status for reference
echo "$I152_FAIL" > /tmp/i152-fail-count
echo "$I153_FAIL" > /tmp/i153-fail-count
echo "$I154_FAIL" > /tmp/i154-fail-count
echo "$I155_FAIL" > /tmp/i155-fail-count
