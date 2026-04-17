#!/bin/bash
set -euo pipefail

LOCKFILE=/tmp/ahvp-deploy.lock
PROJECT_DIR=/root/ai-hardware-verification-platform

# Deploy lock
if [ -f "$LOCKFILE" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCKFILE") ))
  if [ "$LOCK_AGE" -gt 1800 ]; then
    echo "⚠️ Stale lock (${LOCK_AGE}s), removing..."
    rm -f "$LOCKFILE"
  else
    echo "❌ Another deploy in progress (${LOCK_AGE}s ago). Aborting."
    exit 1
  fi
fi
echo "$(whoami)@$(date +%s)" > "$LOCKFILE"
trap "rm -f $LOCKFILE" EXIT

cd "$PROJECT_DIR"

# Get versions
export GIT_COMMIT=$(git rev-parse --short HEAD)
export APP_VERSION=$(git describe --tags --always 2>/dev/null || echo "v0.0.0-dev.$(git rev-list --count HEAD).$(git rev-parse --short HEAD)")
export BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PREV_VER=$(docker inspect ahvp-backend --format='{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep APP_VERSION | cut -d= -f2 || echo "none")
PREV_COMMIT=$(docker inspect ahvp-backend --format='{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep GIT_COMMIT | cut -d= -f2 | head -c8 || echo "none")
echo "Deploying: $APP_VERSION ($GIT_COMMIT) — prev: $PREV_VER ($PREV_COMMIT)"

# Persist version info to .env for docker compose
sed -i '/^GIT_COMMIT=/d;/^APP_VERSION=/d;/^BUILD_TIME=/d' .env 2>/dev/null || true
sed -i '/^# Version (auto-updated/d' .env 2>/dev/null || true
{
  echo ""
  echo "# Version (auto-updated by deploy)"
  echo "GIT_COMMIT=$GIT_COMMIT"
  echo "APP_VERSION=$APP_VERSION"
  echo "BUILD_TIME=$BUILD_TIME"
} >> .env

# Build + tag
# docker compose generates ai-hardware-verification-platform-{backend,frontend}:latest
# We alias to ahvp-{backend,frontend} for consistency
docker compose build backend frontend
COMPOSE_BE="ai-hardware-verification-platform-backend:latest"
COMPOSE_FE="ai-hardware-verification-platform-frontend:latest"
docker tag "$COMPOSE_BE" ahvp-backend:latest
docker tag "$COMPOSE_FE" ahvp-frontend:latest
docker tag "$COMPOSE_BE" "ahvp-backend:$APP_VERSION"
docker tag "$COMPOSE_FE" "ahvp-frontend:$APP_VERSION"
docker tag "$COMPOSE_BE" "ahvp-backend:$GIT_COMMIT"
docker tag "$COMPOSE_FE" "ahvp-frontend:$GIT_COMMIT"

# Deploy
docker compose up -d backend frontend

# Wait for backend
echo "Waiting for backend..."
for i in $(seq 1 30); do
  curl -sf http://localhost:8080/api/health > /dev/null 2>&1 && break
  sleep 2
done

# Smoke test
echo "Running smoke test..."
if bash deploy/smoke-test.sh; then
  echo "🎉 Deploy successful: $APP_VERSION ($GIT_COMMIT)"
else
  echo "❌ Smoke test failed! Rolling back to $PREV_COMMIT..."
  if [ "$PREV_COMMIT" != "none" ]; then
    docker tag "ahvp-backend:$PREV_COMMIT" ahvp-backend:latest
    docker tag "ahvp-frontend:$PREV_COMMIT" ahvp-frontend:latest
    docker compose up -d backend frontend
    echo "Rolled back to $PREV_VER ($PREV_COMMIT)"
  fi
  exit 1
fi
