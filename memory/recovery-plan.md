# 🔧 开发机恢复后行动计划

> 创建时间: 2026-05-05
> 背景: 开发机 (39.97.251.94) 于 5/2 到期停机，等待 chenxi 续费后恢复
> 最后已知状态: 5/1 E2E 回归 600 用例 90.3% 通过率，后端 392 + 前端 77 测试全绿

---

## P0 — 立即执行（恢复后 0-2h）

### P0-1: 验证数据完整性（DB、代码、配置）

**目标:** 确认停机未导致数据丢失或损坏

**步骤:**
1. SSH 登录开发机，检查服务状态
   ```bash
   ssh -i ~/.ssh/dev-ecs.pem root@39.97.251.94
   docker compose ps          # 确认所有容器启动
   docker compose logs --tail=50 backend  # 检查启动日志无异常
   ```
2. 数据库完整性检查
   ```bash
   # 进入 PostgreSQL 容器检查
   docker compose exec db psql -U ahvp -d ahvp_db -c "SELECT count(*) FROM chips;"
   docker compose exec db psql -U ahvp -d ahvp_db -c "SELECT count(*) FROM evaluation_plans;"
   docker compose exec db psql -U ahvp -d ahvp_db -c "SELECT count(*) FROM chip_reports;"
   docker compose exec db psql -U ahvp -d ahvp_db -c "SELECT count(*) FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;"
   ```
3. 代码仓库状态
   ```bash
   cd /opt/ahvp && git status && git log --oneline -5
   # 确认最后提交 = GitHub main 分支最新提交
   git fetch origin && git diff HEAD origin/main --stat
   ```
4. 配置文件检查
   ```bash
   # 确认 .env 和 application.yml 完整
   md5sum .env docker-compose.yml backend/src/main/resources/application.yml
   ```

**验收:** 所有服务运行，数据库表行数与停机前一致，代码与 GitHub 同步

---

### P0-2: Code Review — BaselineService 事务数据丢失风险

**来源:** `/tmp/ahvp-check/docs/code-review-baseline-2026-04-23.md` P0-1

**问题:** `BaselineService.setDefaultBaseline()` 调用 `triggerLatestReportRegeneration()`：
- 先 `reportRepository.delete(latest)` + `flush()`
- 再 `reportGeneratorService.generateReport(planId)`（标注 `@Transactional(REQUIRES_NEW)`）
- 若 `generateReport()` 抛异常，异常被 catch 吞掉，外部事务提交 → **旧报告已删除，新报告未生成 = 数据丢失**

**修复方案:**
```java
// BaselineService.java — triggerLatestReportRegeneration
Long triggerLatestReportRegeneration(Long chipId) {
    // ... 查找 latest report ...
    try {
        reportRepository.delete(latest);
        reportRepository.flush();
        ChipReport newReport = reportGeneratorService.generateReport(planId);
        return newReport.getId();
    } catch (Exception e) {
        log.error("#533: Failed to regenerate report for chip {}: {}", chipId, e.getMessage(), e);
        throw new RuntimeException("Report regeneration failed, rolling back", e);
        // ↑ 不再吞异常，让外部 @Transactional 回滚
    }
}
```

**Code review 其他发现（P1/P2 可稍后处理）:**
- P1-3: `ChipProfile.js` L1125 双逗号 `,,` 可能导致 tab 渲染异常
- P1-4: `POST /reports/{id}/regenerate` 缺少权限控制（应至少 engineer 角色）
- P1-5: `/baselines/coverage` 公开无需认证
- P1-8: `GPU_COUNT_TO_SPEC_ID` 硬编码映射
- P2-1: `listBaselines()` N+1 查询
- P2-3: `baselineCacheBySpec` 无过期机制

**验收:** P0-1 修复提交并通过 `BaselineServiceTest` 全部 22 个测试

---

## P1 — 高优先级（恢复后 2-8h）

### P1-1: 跑全量 E2E 回归

**目标:** 在恢复后的环境重新跑全量回归，确认 5/1 的结果可复现

**步骤:**
1. 启动所有服务（backend + frontend + DB + agent）
2. 执行后端单元测试：`cd backend && mvn test`（预期 392 全绿）
3. 执行前端测试：`cd frontend && npm test`（预期 77 全绿）
4. 执行 E2E 回归：
   ```bash
   bash tests/run-all-tests.sh 2>&1 | tee /tmp/regression-$(date +%Y%m%d).log
   bash e2e-tests/test-report-e2e.sh 2>&1 | tee -a /tmp/regression-$(date +%Y%m%d).log
   ```
5. 对比 5/1 结果，确认失败用例一致

**验收:** 后端+前端测试全绿，E2E 失败数 ≤ 33（与 5/1 一致）

---

### P1-2: 修复报告评分引擎 0 分 bug

**GitHub Issue:** [#549](https://github.com/chenxibj/ai-hardware-verification-platform/issues/549)

**根因:** #529 移除 log10 fallback 后，无 baseline 数据的芯片所有评分返回 -1，`calculateOverallScore()` 过滤 -1 后得到空数组 → `orElse(0)` → overallScore = 0

**修复思路:**
1. 在 E2E 测试 fixture 中注入 baseline 数据
2. 或在 `calculateOverallScore` 中区分"无数据"和"0 分"（返回 null 表示无法评分）
3. 修改 `ReportGeneratorService` 对 overallScore = null 的处理逻辑

**验收:** `test-report-e2e.sh` 的 `1.7c Overall score > 0` 和 `4.6 Legacy data scored` 通过

---

## P2 — 中优先级（恢复后 1-3 天）

### P2-1: 清理 31 个过时 E2E 测试

**GitHub Issue:** [#550](https://github.com/chenxibj/ai-hardware-verification-platform/issues/550)

**工作量估计:** ~8h

**关键任务:**
- 修复测试用户认证（密码环境变量化）
- 更新 API 断言中的 JSON path
- GPU 测试在无 GPU 环境下优雅跳过

**验收:** E2E 通过率从 90.3% → 95%+

---

### P2-2: 下一期 PRD 细化

**目标:** 为下一阶段开发准备产品需求文档

**待细化模块:**
1. **数字资产管理** — 测试数据、评测结果的版本化管理和归档
2. **资源管理** — GPU 节点池管理、任务调度优化、资源配额

**输出:** 细化的 PRD 文档 + GitHub issues（拆分到可执行的开发任务）

---

## 优先级总览

| 优先级 | 任务 | 预计耗时 | 依赖 |
|--------|------|----------|------|
| P0 | 验证数据完整性 | 30min | 开发机恢复 |
| P0 | Code review P0-1 修复 | 2h | 开发机恢复 |
| P1 | 全量 E2E 回归 | 1h | P0 完成 |
| P1 | 修复评分引擎 0 分 bug (#549) | 3-4h | P0 完成 |
| P2 | 清理过时 E2E 测试 (#550) | 8h | P1 完成 |
| P2 | 下一期 PRD 细化 | 4-6h | 无依赖 |

---

## 风险提示

1. **开发机到期时间不确定** — 需要 chenxi 确认续费计划。如果长时间不恢复，考虑在本机（轻量应用服务器 2C2G）搭建最小化开发环境
2. **数据库可能丢失** — 如果开发机释放（非停机），所有数据将丢失。确认阿里云 ECS 停机后的数据保留策略
3. **GPU 测试节点** — L40S 测试机 (180.184.249.205) 状态未知，需要单独确认
