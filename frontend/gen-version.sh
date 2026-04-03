#!/bin/bash
# 构建前生成版本信息
COMMIT=$(git rev-parse --short=12 HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > public/version.json << EOF
{
  "commit": "$COMMIT",
  "buildTime": "$TIMESTAMP",
  "builder": "${USER:-ci}"
}
EOF
echo "Generated version.json: commit=$COMMIT time=$TIMESTAMP"
