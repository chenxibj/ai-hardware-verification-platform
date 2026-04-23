# Baseline Code Review — 2026-04-23

## 审查范围

### Commits
| Commit | 说明 |
|--------|------|
| `abaa813f` | feat(#531,#532,#533,#534): Baseline enhancements — staleness, auto-select, regenerate, coverage stats |
| `fedacb7a` | feat(#528): Baseline 按规格匹配 + 管理 API |
| `0babafcc` | fix(scoring): remove log10 fallback, infer runSpecId from evalConfig |

### 变更文件（主要）
- `BaselineService.java` (530 行) — 新建 Baseline 管理服务
- `BaselineController.java` (98 行) — Baseline REST API
- `ScoringService.java` (661 行) — 评分服务增强（spec-aware、log10 废弃、runSpec推断）
- `ReportGeneratorService.java` (947 行) — 报告生成增强（baseline source、spec-aware scoring）
- `ChipReport.java` — 新增 baseline_source 字段
- `Chip.java` — 新增 default_baseline_plan_id 字段
- `SecurityConfig.java` — 新增 baseline 端点放行规则
- `EvaluationPlanRepository.java` — 新增按 chipId+runSpecId+status 查询方法
- `EvaluationResultService.java` — spec-aware dimension scoring
- `application.yml` — Baseline 配置项
- `ChipProfile.js` (1358 行) — 前端 Baseline tab

### 测试文件
- `BaselineServiceTest.java` — 22 tests（#528 base + #531 staleness + #532 auto-recommend + #533 report regen + #534 stdDev）
- `RunSpecInferenceTest.java` — 15 tests（#530 eval_config → runSpecId 推断）
- `ScoringServiceTest.java` — 更新已有测试适配 #529 变更
- `SpecAwareScoringTest.java` — 更新已有测试适配 #529 变更

---

## 发现的问题

### P0 — 必须修复

#### P0-1: `setDefaultBaseline` 事务内 report regeneration 存在数据丢失风险
**文件:** `BaselineService.java` L315-320, L329-358
**问题:** `setDefaultBaseline()` (`@Transactional`) 调用 `triggerLatestReportRegeneration()`，后者先 `reportRepository.delete(latest)` + `flush()`，然后调用 `reportGeneratorService.generateReport(planId)`。

- `generateReport()` 标注 `@Transactional(REQUIRES_NEW)`，会挂起外部事务并开新事务。
- 如果 `generateReport()` 抛异常，`triggerLatestReportRegeneration` 捕获异常返回 null，外部事务继续并提交 → **旧报告被删除，新报告未生成 = 数据丢失**。
- 虽然 `generateReport` 内部有 try-catch，但任何未预期的异常（OOM、DB连接断开等）都会触发此场景。

**建议修复:** 将 delete + generate 放在同一个 `REQUIRES_NEW` 事务中，或者在 `triggerLatestReportRegeneration` 失败时重新抛出异常让外部事务回滚。

```java
// 修复方案：失败时回滚整个操作
Long triggerLatestReportRegeneration(Long chipId) {
    // ... 查找 latest report ...
    try {
        reportRepository.delete(latest);
        reportRepository.flush();
        ChipReport newReport = reportGeneratorService.generateReport(planId);
        return newReport.getId();
    } catch (Exception e) {
        log.error("#533: Failed to regenerate report for chip {}: {}", chipId, e.getMessage(), e);
        throw new RuntimeException("Report regeneration failed, rolling back baseline change", e);
    }
}
```

#### P0-2: `ChipReport.java` baseline_source 字段声明格式严重错误
**文件:** `ChipReport.java` L97
**问题:** 三个注解和字段声明全部挤在一行：
```java
@JdbcTypeCode(SqlTypes.JSON)    @Column(name = "baseline_source", columnDefinition = "jsonb")    private String baselineSource;
```
虽然 Java 编译器可以处理，但这违反了所有代码规范，且极难维护和审查。IDE 自动格式化可能产生意外结果。

**建议修复:** 拆成标准多行：
```java
@JdbcTypeCode(SqlTypes.JSON)
@Column(name = "baseline_source", columnDefinition = "jsonb")
private String baselineSource;
```

---

### P1 — 建议修复

#### P1-1: `ReportGeneratorService.java` 导入语句和字段声明格式错误
**文件:** `ReportGeneratorService.java` L18, L57
**问题:** 两处格式问题：
- L18: `import com.lab.runspec.RunSpec;import com.lab.runspec.RunSpecRepository;` — 两条 import 挤在一行
- L57: `private final RunSpecRepository runSpecRepository;` — 缺少缩进（应对齐其他字段）

**影响:** 代码可读性差，格式不一致。

#### P1-2: `SecurityConfig.java` baseline 规则缺少缩进
**文件:** `SecurityConfig.java` L66
**问题:** `.requestMatchers("/baselines/**").permitAll()` 缺少缩进，与上下行不对齐。

#### P1-3: `ChipProfile.js` L1125 存在双逗号语法问题
**文件:** `frontend/src/pages/ChipProfile.js` L1125
**问题:** `},\n    ,{` — tab items 数组中多了一个逗号。虽然 JS 引擎通常能处理尾逗号，但 `,,` 会产生 `undefined` 元素（Elision），可能导致 tab 渲染异常。

```javascript
// 当前（有问题）
    },
    ,{
      key: "baseline",

// 应改为
    },
    {
      key: "baseline",
```

#### P1-4: `POST /reports/{id}/regenerate` 端点缺少权限控制
**文件:** `BaselineController.java` L82, `SecurityConfig.java`
**问题:** 报告重新生成是一个破坏性操作（删除旧报告 + 生成新报告），但只需要 `.authenticated()` 权限。应至少要求 `engineer` 角色。

#### P1-5: `/baselines/coverage` 端点公开无需认证
**文件:** `SecurityConfig.java` L66
**问题:** `/baselines/coverage` 设为 `.permitAll()`，未经认证即可查询芯片测试覆盖率数据。虽然是只读接口，但泄露了测试项和覆盖率信息。建议改为 `.authenticated()`。

#### P1-6: `ScoringService` 文件行数过多 (661 行)
**文件:** `ScoringService.java`
**问题:** 超过 300 行阈值（661 行）。该服务承担了太多职责：评分计算、baseline 缓存管理、runSpec 推断、baseline 覆盖率查询、baseline 来源查询。
**建议:** 将 baseline 数据加载和缓存逻辑抽取到 `BaselineDataService`，将 runSpec 推断逻辑抽取到 `RunSpecResolver`。

#### P1-7: `ReportGeneratorService` 文件行数过多 (947 行)
**文件:** `ReportGeneratorService.java`
**问题:** 近 1000 行，远超 300 行阈值。

#### P1-8: `GPU_COUNT_TO_SPEC_ID` 硬编码 runSpecId 映射
**文件:** `ScoringService.java` L66-73
**问题:** GPU 数量到 runSpecId 的映射是硬编码的（`1→13L, 2→14L, 4→15L, 8→16L, 0→11L`）。如果数据库中的 `run_specs` 表 ID 发生变化，代码会静默产生错误结果。
**建议:** 从数据库 `run_specs` 表动态加载映射，或至少在应用启动时做校验。

---

### P2 — 改进建议

#### P2-1: `BaselineService.listBaselines()` N+1 查询问题
**文件:** `BaselineService.java` L92-170
**问题:** 对每个 plan 分别调用 `resultRepository.findByPlanId()` 和 `taskRepository.findByPlanId()`，在 plans 较多时产生 N+1 查询问题。
**建议:** 使用批量查询（如 `findByPlanIdIn(List<Long>)`）减少数据库调用。

#### P2-2: `getBaselineCoverage()` 中的 `chipPlans` 查询重复
**文件:** `BaselineService.java` L385-465
**问题:** `getBaselineCoverage` 内部对 chipPlans 做了查询，`buildOperatorDetails` 又对 plans 做了查询。部分查询逻辑重复。

#### P2-3: `baselineCacheBySpec` 无过期机制
**文件:** `ScoringService.java`
**问题:** `ConcurrentHashMap` 缓存没有自动过期，只在手动调用 `clearBaselineCache()` 时清除。长期运行的服务器可能累积大量不同 runSpecId 的缓存。
**建议:** 考虑使用 Caffeine 或 Spring Cache 添加 TTL。

#### P2-4: 前端 Baseline tab 没有操作按钮
**文件:** `ChipProfile.js` L1125-1188
**问题:** Baseline tab 目前只有展示功能，没有"设为默认"、"重新生成报告"等操作按钮。后端 API (`PUT /chips/{id}/baseline`, `POST /reports/{id}/regenerate`) 已就绪但前端未对接。

#### P2-5: `application.yml` 注释缩进不一致
**文件:** `application.yml` L103
**问题:** `# #531/#534: Baseline configuration` 注释没有缩进，但其下的 `baseline:` 有缩进（属于 `ahvp:` 的子节点）。虽然 YAML 语法合法，但可能造成误读。

#### P2-6: 可考虑为 `BaselineController` 添加 `@RequestMapping` 前缀
**问题:** 控制器直接映射 `/chips/{id}/baselines` 和 `/baselines/coverage`，没有统一前缀。虽然有 context-path `/api`，但建议加 `@RequestMapping` 增强可读性。

---

## 测试覆盖情况

### 有测试覆盖的功能

| 功能 | 测试文件 | 测试数量 | 覆盖程度 |
|------|----------|----------|----------|
| #528 Baseline 按规格匹配 | `BaselineServiceTest.java`, `SpecAwareScoringTest.java` | ~12 | ✅ 良好 |
| #531 Staleness 过期警告 | `BaselineServiceTest.java` (Nested: StalenessWarning) | 3 | ✅ 良好 |
| #532 Auto-recommend by coverage | `BaselineServiceTest.java` (Nested: AutoRecommend) | 4 | ✅ 良好 |
| #533 Report regeneration | `BaselineServiceTest.java` (Nested: ReportRegeneration) | 5 | ✅ 良好 |
| #534 Operator stdDev | `BaselineServiceTest.java` (Nested: RoundCountAndStdDev) | 4 | ✅ 良好 |
| #529 log10 fallback 移除 | `ScoringServiceTest.java` (更新) | 3 | ✅ 良好 |
| #530 runSpecId 推断 | `RunSpecInferenceTest.java` | 15 | ✅ 全面 |

### 缺少测试的功能

| 功能 | 原因 | 优先级 |
|------|------|--------|
| `BaselineController` REST API | 无集成测试/MockMvc 测试 | 中 |
| 前端 Baseline Tab | 无前端测试（整个项目前端测试很少） | 低 |
| `triggerLatestReportRegeneration` 失败场景 | 无测试覆盖 `generateReport` 抛异常时的行为（P0-1） | 高 |
| `ScoringService.getBaselineSource()` | 无独立测试 | 低 |
| 数据库迁移脚本 | 未在 review 中看到 Flyway/Liquibase migration | 中 |

---

## 总体评价

### 优点
1. **架构设计合理** — Baseline 按 run_spec 分组、spec-aware 评分、旧数据兼容（#530 inferRunSpecId）都是正确的设计决策。
2. **测试覆盖全面** — 后端新功能有 ~40 个测试，覆盖正常和异常路径，使用 Nested class 组织清晰。
3. **向后兼容性好** — 所有新 API 方法都保留了无参版本（如 `scoreFromMetrics(String)` → `scoreFromMetrics(String, String, Long)`），旧调用者不受影响。
4. **错误处理到位** — Controller 层有 try-catch + ApiResponse 错误码，Service 层有合理的日志。
5. **#529 移除 log10 fallback** — 果断废弃不合理的旧算法，用 score=-1 标识无 baseline 数据，比 fallback 到不可靠的绝对评分更诚实。

### 需要关注
1. **P0-1 是最严重的问题** — `setDefaultBaseline` 事务内的 report regeneration 在 `generateReport` 失败时会丢数据。建议立即修复。
2. **代码格式问题较多** — 多处格式问题（单行多声明、缺缩进、双逗号），建议统一做一次格式化。
3. **大文件需要拆分** — `ScoringService` (661行) 和 `ReportGeneratorService` (947行) 需要重构拆分。
4. **前端只完成了展示** — Baseline tab 只有只读展示，设为默认/重新生成等操作按钮尚未实现。

### 风险评估
- **数据兼容性:** ✅ 低风险 — 新字段 (`default_baseline_plan_id`, `baseline_source`) 都是 nullable，旧数据不受影响。`#530` 的 evalConfig 推断逻辑也有 null 保护。
- **性能:** ⚠️ 中风险 — N+1 查询在芯片有大量 plans 时可能影响响应时间。baseline 缓存无 TTL。
- **安全:** ⚠️ 中风险 — `/baselines/coverage` 公开，`POST /reports/{id}/regenerate` 权限不足。

