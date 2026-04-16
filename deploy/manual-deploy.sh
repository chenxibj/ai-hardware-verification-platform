#!/usr/bin/env bash
# 手动部署时也注入版本信息，禁止裸 docker compose up
set -euo pipefail
cd /root/ai-hardware-verification-platform
git pull origin main
export GIT_COMMIT=$(git rev-parse --short HEAD)
export APP_VERSION=$(git describe --tags --always 2>/dev/null || echo "v0.0.0-dev.$(git rev-list --count HEAD).$(git rev-parse --short HEAD)")
export BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "Deploying: $APP_VERSION ($GIT_COMMIT) built at $BUILD_TIME"
docker compose build --no-cache backend frontend
docker compose up -d backend frontend
sleep 15
bash deploy/smoke-test.sh
echo "Deploy complete: $APP_VERSION"
