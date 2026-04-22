#!/bin/bash
# AHVP 健康检查脚本
# 每 5 分钟由 cron 执行，连续 2 次失败则告警

STATE_FILE="/tmp/ahvp-health-state"
LOG_FILE="/var/log/ahvp-health.log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

check_frontend() {
  local resp
  resp=$(curl -s -o /tmp/ahvp-health-html -w "%{http_code}" --max-time 10 http://localhost/ 2>/dev/null)
  if [ "$resp" != "200" ]; then
    echo "前端 HTTP 状态码: $resp, 期望 200"
    return 1
  fi
  if ! grep -q '\.js"' /tmp/ahvp-health-html; then
    echo "前端 HTML 中未找到 JS 引用"
    return 1
  fi
  local js_file
  js_file=$(grep -oP 'src="/static/js/main\.[a-f0-9]+\.js"' /tmp/ahvp-health-html | head -1 | grep -oP '/static/js/main\.[a-f0-9]+\.js')
  if [ -z "$js_file" ]; then
    echo "无法提取 JS 文件路径"
    return 1
  fi
  local js_size
  js_size=$(curl -s -o /dev/null -w "%{size_download}" --max-time 15 "http://localhost${js_file}" 2>/dev/null)
  if [ "$js_size" -lt 500000 ] 2>/dev/null; then
    echo "JS 文件过小: ${js_size} bytes, 期望大于 500KB"
    return 1
  fi
  return 0
}

check_backend() {
  local resp
  resp=$(curl -s --max-time 10 -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@ahvp.com","password":"Test1234"}' 2>/dev/null)
  local code
  code=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)
  if [ "$code" != "0" ]; then
    echo "后端登录接口异常: code=$code"
    return 1
  fi
  return 0
}

check_containers() {
  local unhealthy=""
  for name in ahvp-frontend ahvp-backend ahvp-postgres ahvp-redis ahvp-minio; do
    local status
    status=$(docker inspect --format='{{.State.Status}}' "$name" 2>/dev/null)
    if [ "$status" != "running" ]; then
      unhealthy="$unhealthy $name=$status"
    fi
  done
  if [ -n "$unhealthy" ]; then
    echo "容器异常:$unhealthy"
    return 1
  fi
  return 0
}

check_render() {
  local render_script="$SCRIPT_DIR/render-check.js"
  if [ ! -f "$render_script" ]; then
    echo "render-check.js 不存在: $render_script"
    return 1
  fi
  if [ ! -d "$PROJECT_ROOT/node_modules/puppeteer" ]; then
    echo "puppeteer 未安装，跳过渲染检查"
    return 1
  fi
  # Quick mode: only check login page renders, don't do full login flow
  local output
  output=$(cd "$PROJECT_ROOT" && timeout 45 node "$render_script" --quick 2>&1)
  local rc=$?
  if [ $rc -ne 0 ]; then
    echo "渲染检查失败 (exit=$rc): $(echo "$output" | grep 'FAIL' | head -3)"
    return 1
  fi
  return 0
}

# 执行所有检查
errors=""
for check in check_containers check_frontend check_backend check_render; do
  result=$($check 2>&1)
  rc=$?
  if [ $rc -ne 0 ]; then
    errors="${errors}\n- ${result}"
  fi
done

# 读取上次状态
prev_state=$(cat "$STATE_FILE" 2>/dev/null || echo "0")

if [ -z "$errors" ]; then
  if [ "$prev_state" -ge 2 ] 2>/dev/null; then
    log "RECOVERY: 恢复正常, 之前连续失败 $prev_state 次"
    echo "ALERT:RECOVERY:$prev_state"
  fi
  echo "0" > "$STATE_FILE"
  log "OK"
else
  new_state=$((prev_state + 1))
  echo "$new_state" > "$STATE_FILE"
  log "FAIL #${new_state}: $(echo -e "$errors" | tr '\n' ' ')"

  if [ "$new_state" -ge 2 ]; then
    echo -e "ALERT:FAILURE:${new_state}:${errors}"
  else
    echo "WARN:FIRST_FAIL"
  fi
fi
