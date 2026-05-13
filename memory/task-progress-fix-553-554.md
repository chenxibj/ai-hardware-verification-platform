# Fix #553 & #554 - Progress

## Status: ✅ COMPLETED (2026-05-13 08:40)

## Commit: `86cdb8e5` on `main`

## Issue #553: Agent Hardcoded Token
**Problem:** `agent/config.yaml` and multiple other files contained hardcoded `ahvp-agent-secret-2026`.

**Files changed:**
- `agent/config.yaml` — `token: ${AGENT_TOKEN:changeme-on-deploy}`
- `agent/k8s-agent-daemonset.yaml` — uses `secretKeyRef` from `ahvp-secrets`
- `agent/k8s_routes.py` — `os.environ.get("AGENT_TOKEN", ...)`
- `agent/tests/test_503_security.py` — env var based
- `agent/tests/test_505_selfheal.py` — env var based
- `tests/test_gpu_p1p2.py` — env var based (added `import os`)
- `tests/run-all-tests.sh` — `${AGENT_TOKEN:-changeme-on-deploy}`
- `e2e-tests/test-report-e2e.sh` — `${AGENT_TOKEN:-changeme-on-deploy}`
- `frontend/src/components/resource/NodeRegisterTab.js` — `${AGENT_TOKEN}` placeholder
- `.env.example` — added `AGENT_TOKEN=` placeholder

**Verification:** `grep -rn "ahvp-agent-secret-2026" .` returns empty (excluding .git/memory)

## Issue #554: Duplicate Flyway Config + V3 Migration
**Problem 1:** Two `spring.flyway:` blocks in `application.yml` with conflicting `baseline-version`.
**Problem 2:** V3 migration `ALTER TABLE` fails on fresh deploy where column is already `bigint[]`.

**Fixes:**
- Removed duplicate flyway block (lines 7-11), keeping single block with `baseline-version: 1`
- Rewrote V3 migration with `DO $$ BEGIN IF EXISTS ... END $$` defensive check
- Rebuilt Docker image (`docker compose build backend`)

**Verification:**
- Backend starts successfully, Flyway no errors
- `grep -c 'flyway:' application.yml` = 1
- Hibernate queries executing normally

## Both issues closed via `gh issue close`
