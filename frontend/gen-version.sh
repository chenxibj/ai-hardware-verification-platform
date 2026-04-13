#!/bin/bash
# 构建前生成版本信息
COMMIT=$(git rev-parse --short=12 HEAD 2>/dev/null || echo "${GIT_COMMIT:-unknown}")
VERSION=${APP_VERSION:-$COMMIT}
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > public/version.json << EOF
{
  "version": "$VERSION",
  "commit": "$COMMIT",
  "buildTime": "${BUILD_TIME:-$TIMESTAMP}",
  "builder": "${USER:-ci}"
}
EOF
echo "Generated version.json: version=$VERSION commit=$COMMIT time=$TIMESTAMP"
