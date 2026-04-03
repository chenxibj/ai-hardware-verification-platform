#!/bin/bash
# AHVP 健康检查 cron wrapper
# 调用 health-check.sh，解析结果，通过 OpenClaw 发飞书告警

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULT=$(/root/ai-hardware-verification-platform/deploy/health-check.sh 2>&1)

if echo "$RESULT" | grep -q "ALERT:FAILURE"; then
  FAIL_COUNT=$(echo "$RESULT" | grep -oP 'ALERT:FAILURE:\K[0-9]+')
  ERRORS=$(echo "$RESULT" | grep -oP 'ALERT:FAILURE:[0-9]+:\K.*')
  # 写入告警文件供 OpenClaw 读取
  cat > /tmp/ahvp-alert-pending << EOF
🚨 AHVP 平台健康检查告警

连续 ${FAIL_COUNT} 次检查失败:
$(echo -e "$ERRORS")

检查时间: $(date '+%Y-%m-%d %H:%M:%S')
服务器: 39.97.251.94
EOF

elif echo "$RESULT" | grep -q "ALERT:RECOVERY"; then
  PREV_COUNT=$(echo "$RESULT" | grep -oP 'ALERT:RECOVERY:\K[0-9]+')
  cat > /tmp/ahvp-alert-pending << EOF
✅ AHVP 平台已恢复正常

之前连续故障 ${PREV_COUNT} 次检查
恢复时间: $(date '+%Y-%m-%d %H:%M:%S')
EOF
fi
