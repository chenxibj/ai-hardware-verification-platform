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
PREV_VER=$(docker inspect ahvp-backend --format='{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep GIT_COMMIT | cut -d= -f2 | head -c8 || echo "none")
echo "Deploying: $GIT_COMMIT (prev: $PREV_VER)"

# Build + tag
docker compose build backend frontend
docker tag ahvp-backend:latest "ahvp-backend:$GIT_COMMIT"
docker tag ahvp-frontend:latest "ahvp-frontend:$GIT_COMMIT"

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
  echo "🎉 Deploy successful: $GIT_COMMIT"
else
  echo "❌ Smoke test failed! Rolling back to $PREV_VER..."
  if [ "$PREV_VER" != "none" ]; then
    docker tag "ahvp-backend:$PREV_VER" ahvp-backend:latest
    docker tag "ahvp-frontend:$PREV_VER" ahvp-frontend:latest
    docker compose up -d backend frontend
    echo "Rolled back to $PREV_VER"
  fi
  exit 1
fi
