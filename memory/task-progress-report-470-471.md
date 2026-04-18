# Task Progress: Fix #470 + #471

## Status: Building (deploy in progress)

## What's done:
1. **#470 Backend fix** — `ReportGeneratorService.buildBottleneckAnalysis()` now filters `score < 80` before selecting worst operators. Full-score operators no longer appear as "低性能算子".
2. **#471 Backend fix** — New `extractExecutionEnvironment()` method reads `metrics_summary` JSON from evaluation results to extract `device`, `gpu_name`, `gpu_count`, `runtime`. Stored in new `execution_environment` jsonb column on `chip_reports` table.
3. **#471 Frontend fix** — `ChipReport.js` Section 7 and `ChipProfile.js` 板块5 now read `execEnv` from `report.executionEnvironment` instead of hardcoding "CPU 评测模式".
4. **DB migration** — `ALTER TABLE chip_reports ADD COLUMN execution_environment jsonb` applied.
5. **Committed** — `08d573f6` on main.
6. **Push + Build** — Running in background on dev machine (PID 2949902 backend, 2950180 frontend, 2950504 git push).

## Files changed:
- `backend/src/main/java/com/lab/chipreport/ChipReport.java` (+4 lines: executionEnvironment field)
- `backend/src/main/java/com/lab/chipreport/ReportGeneratorService.java` (+120 lines: threshold fix + env extraction)
- `frontend/src/pages/ChipReport.js` (dynamic Section 7)
- `frontend/src/pages/ChipProfile.js` (dynamic 板块5)

## Next steps:
- Wait for builds to complete
- `docker compose up -d backend frontend` to deploy
- Regenerate a report to verify #471 (existing reports won't have executionEnvironment populated)
- Verify #470 by checking bottleneck analysis with high-score operators
- Close issues with gh CLI
