# Task Progress: Fix #497 + #499

## Status: ✅ COMPLETED

## Timeline
- **20:47** - Started analysis of codebase
- **20:54** - Ran unit tests (14 tests, all pass)
- **20:57** - Ran full test suite (204 tests; 14 relevant tests pass, 18 pre-existing failures in unrelated tests)
- **21:00** - Built and deployed backend
- **21:02** - Backend running and healthy, login works, API responsive

## What Was Done

### Pre-existing Fixes Found
Both #497 and #499 were already fixed in prior commits:
- `f60cfc38` — #497: Added GPU slot release in `recoverOfflineNodeTasks()`
- `a48c2a34` — #499: Changed `cancelPlan()` to release GPU for ALL non-terminal tasks

### Verified & Deployed

1. **#497 — Offline Node Task Recovery + GPU Release**
   - `checkOfflineNodes()` correctly marks heartbeat-expired (>2min) nodes as OFFLINE ✅
   - `recoverOfflineNodeTasks()` recovers RUNNING/DISPATCHED tasks → QUEUED + releases GPU slots ✅
   - 4 unit tests in `OfflineNodeRecoveryTest` all pass ✅

2. **#499 — GPU Slot Release on Plan Cancel**
   - `cancelPlan()` now releases GPU for ALL non-terminal tasks (RUNNING, DISPATCHED, QUEUED, PAUSED) ✅
   - 2 unit tests in `PlanCancelGpuSlotTest` all pass ✅

3. **GPU Slot GC (Orphan Reclaim)**
   - `reclaimOrphanSlots()` runs every 5 min, frees ALLOCATED slots pointing to terminal tasks ✅
   - 4 unit tests in `GpuSlotOrphanReclaimTest` all pass ✅

4. **Code pushed to GitHub** — 3 commits (f7239017, f60cfc38, a48c2a34) pushed to origin/main ✅

5. **Deployed** — `docker compose up -d --build backend` completed, backend healthy ✅

## Test Summary
| Test Class | Tests | Status |
|---|---|---|
| OfflineNodeRecoveryTest | 4 | ✅ All pass |
| PlanCancelGpuSlotTest | 2 | ✅ All pass |
| TaskRecoverySchedulerTest | 4 | ✅ All pass |
| GpuSlotOrphanReclaimTest | 4 | ✅ All pass |
| **Total relevant** | **14** | **✅ All pass** |

## Pre-existing Test Failures (NOT caused by our changes)
- `TaskLifecycleServiceTest` — 13 tests, 10 failures (stale mocks after #493 refactor)
- `EvaluationTaskServiceTest` — 31 tests, 5 failures (PENDING→QUEUED behavior change)
- `UserServiceTest` — 9 tests, 3 failures (password validation rules changed)

## GPU Slot Release Coverage (4 code paths)
1. `cancelPlan()` — releases ALL non-terminal tasks' slots
2. `TaskLifecycleService.onTaskTerminated()` — releases on individual task completion
3. `recoverOfflineNodeTasks()` — releases when recovering from OFFLINE nodes
4. `reclaimOrphanSlots()` — periodic GC every 5min for orphaned ALLOCATED slots
