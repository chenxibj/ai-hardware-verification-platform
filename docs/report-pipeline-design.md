# 评测报告全流程设计方案（v3.0）

> 📅 2026-04-19 | 作者：菜菜子 | Review：麦克雷
> v2.0 → v3.0 变更：吸收麦克雷 11 条 Review Comments（P0×3 + P1×4 + P2×4），所有建议已融入正文。

---

## 一、问题诊断：当前链路为什么不可靠

### 1.1 数据采集阶段

| 问题 | 根因 | 影响 |
|------|------|------|
| Agent 执行任务但 progress=0 | 初始进度上报可能失败，Recovery 误判超时 | 有效数据丢失，报告覆盖率低 |
| metrics_summary 格式不统一 | Agent 端 eval 脚本输出格式自由，后端 extractMetrics 靠猜 | 评分计算拿不到延迟/吞吐 |
| 嵌套 JSON 路径不确定 | result.eval_result.summary vs results[0] vs 顶层 | flattenMetrics 需要 fallback 链 |
| snake_case vs camelCase 混用 | Agent 用 snake_case，前端用 camelCase | 字段匹配失败导致 NO_DATA |
| **旧路径 /tasks/{id}/complete 数据污染** | TaskCompleteController 把 metricsSummary 当 rawData 存 | 下游 flattenMetrics 解析不到真实指标 |

### 1.2 评分计算阶段

| 问题 | 根因 | 影响 |
|------|------|------|
| vs L40S baseline 可能没数据 | baseline cache 可能为空 | fallback 到 log10 算法，评分不可比 |
| **score=50 默认值陷阱** | 无法识别指标时返回 50 | NO_DATA 的 result 有"看似有效"的 50 分，污染报告 |
| **baseline 自比强制 100% 掩盖问题** | isBaselineChip 时 replaceAll 100% | MLP latency=NULL 但 score=100，掩盖数据缺失 |
| overallScore 算法不一致 | ReportGeneratorService 用算子均值，EvaluationResultService 用维度均值 | 同一 Plan 不同入口出不同分 |
| **评分缺少可解释性** | operatorRanking 只有被测芯片数据 | 用户看 score=85 不知道 L40S 参考延迟 |
| **浮点精度问题** | 100.00000000000001 | DB 和 API 返回困惑调用方 |
| 旧报告中文 key 新报告英文 key | DimensionRegistry 演进不兼容 | 前端展示报错 |

### 1.3 报告生成阶段

| 问题 | 根因 | 影响 |
|------|------|------|
| @Transactional 缺失 (#508) | scheduler 路径无事务，AFTER_COMMIT 不触发 | 含 failed 任务的 Plan 不生成报告 |
| 两个 ReportGenerator 共存 | 旧版 + 新版并行 | 代码冗余，逻辑可能不一致 |
| 报告号 random 可能重复 | Math.random() * 1000 只有 3 位 | 极端并发下报告号冲突 |
| **双保险无幂等保护** | Recovery 每 30s 扫描触发，无锁 | 可能重复生成报告 |
| **无质量门禁** | 任何覆盖率都直接 PUBLISHED | Agent 全面故障时生成的报告毫无参考价值 |
| **不区分失败类型** | 只有 passed=true/false | "未执行"和"不达标"性质完全不同但混为一谈 |

---

## 二、设计目标

1. **数据可靠**：Agent 上报的原始数据零丢失，格式有强约束
2. **计算准确**：评分算法明确、可解释、可复现，消除默认值陷阱
3. **生成确定性**：Plan 完成 → 报告 100% 生成（幂等），无遗漏
4. **质量有底线**：低覆盖率报告不直接发布，需人工确认
5. **失败可追溯**：区分未执行 / 执行失败 / 数据缺失，报告中分色展示
6. **兼容性**：旧数据格式能被正确处理
7. **可观测**：每个环节有日志/状态，fallback 路径可追溯

---

## 三、全流程架构

```
┌──────────────────────────────────────────────────────────────────┐
│                    评测报告生成全流程 v3.0                          │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│ Phase 1  │ Phase 2  │ Phase 3  │ Phase 4  │ Phase 5             │
│ 数据采集  │ 数据校验  │ 评分计算  │ 报告组装  │ 报告存储+通知        │
│          │ & 归一化  │          │ + 质量门禁│                     │
├──────────┼──────────┼──────────┼──────────┼─────────────────────┤
│ Agent    │ Backend  │ Backend  │ Backend  │ Backend → Frontend  │
│ 执行脚本  │ Metrics  │ Scoring  │ Report   │ DB + WebSocket      │
│ → 上报   │ Normal.  │ Service  │ Generator│ 通知                │
│ → 校验   │ + Result │ (唯一)   │ + 门禁   │                     │
└──────────┴──────────┴──────────┴──────────┴─────────────────────┘
```

---

## 四、Phase 1：数据采集（Agent 端）

### 4.1 评测脚本输出规范（强制约束）

所有评测脚本必须输出标准化 JSON（最后一行），必填字段：

| 字段 | 类型 | 说明 | 缺少时 |
|------|------|------|--------|
| `results[].latency_ms_mean` | double | 平均延迟 ms | 标记 NO_DATA |
| `results[].throughput_ops` | double | 吞吐量 ops/s | 标记 NO_DATA |
| `results[].status` | string | PASS / FAIL | 标记 NO_DATA |

Agent executor 在脚本执行后校验输出。校验失败时构造 NO_DATA 状态结果上报（附带原始 stdout），**不丢弃数据**。

### 4.2 数据上报协议（统一入口）

```
POST /api/tasks/{taskId}/result    ← 唯一标准路径
```

**⚠️ 废弃路径处理（麦克雷 #1）：**
- `POST /tasks/{id}/complete`（TaskCompleteController）**标记 @Deprecated**
- 响应增加 `Warning: 299 - "This endpoint is deprecated. Use POST /tasks/{id}/result instead."`
- 2 周后改为返回 `410 Gone`（feature flag 控制：`api.legacy.complete.enabled=false`）
- 此路径的问题：`result.setRawData(metricsSummary)` 把摘要当原始数据存，下游解析失败

---

## 五、Phase 2：数据校验 & 归一化（Backend）

### 5.1 MetricsNormalizer（新增核心类）

```java
/**
 * 统一处理各种格式的 metrics 数据，输出标准化结构。
 * 解决：嵌套路径不一致、命名混用、数据缺失判定。
 */
public class MetricsNormalizer {

    // 延迟字段搜索优先级（首选 → fallback）
    static final String[] LATENCY_KEYS = {
        "latency_ms_mean", "latency_mean", "latencyMean",
        "avg_latency_ms", "latency_ms_p50"
    };

    // 吞吐量字段搜索优先级
    static final String[] THROUGHPUT_KEYS = {
        "throughput_ops", "throughput_qps", "throughput",
        "throughput_fps", "avg_throughput_qps"
    };

    public static NormalizedMetrics normalize(Map<String, Object> rawData) {
        Map<String, Object> flat = flattenAllPaths(rawData);

        // 🔍 提取指标，走 fallback 时记日志（麦克雷 #8）
        double latency = findFirstWithLog(flat, LATENCY_KEYS, "latency");
        double throughput = findFirstWithLog(flat, THROUGHPUT_KEYS, "throughput");

        // 📐 浮点精度处理（麦克雷 #9）：保留 2 位小数
        latency = roundTo2(latency);
        throughput = roundTo2(throughput);

        // 判定数据状态
        DataStatus status;
        if (latency > 0 && throughput > 0) status = VALID;
        else if (latency > 0 || throughput > 0) status = PARTIAL;
        else status = NO_DATA;

        return new NormalizedMetrics(latency, throughput, ..., status, rawData);
    }

    private static double roundTo2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
```

### 5.2 EvaluationResult 新增字段

```java
@Column(name = "data_status")
private String dataStatus;  // VALID / PARTIAL / NO_DATA

@Column(name = "failure_type")
private String failureType;  // 见 Phase 4
```

`ddl-auto=update` 自动加列。

---

## 六、Phase 3：评分计算

### 6.1 ScoringService 为唯一评分入口

**消除双重评分逻辑：** 删除 EvaluationResultService 中的 calculateScore / calculateOperatorScore / calculateModelScore，统一到 ScoringService。

### 6.2 评分算法

```
score = (baseline_latency / chip_latency) × 100%
```

**Fallback 策略：**
1. 优先找 L40S 同名算子 baseline
2. 次优：前缀匹配
3. 最终 fallback：log10 评分（报告中明确标注"无基准对比"）

### 6.3 score 与 DataStatus 联动（麦克雷 #2 — P0）

| DataStatus | score 值 | 是否参与 overallScore | 报告中展示 |
|-----------|----------|---------------------|-----------|
| VALID | 正常计算值 | ✅ 参与 | 正常显示 |
| PARTIAL | 正常计算（有什么算什么）| ✅ 参与 | 黄色标注 |
| NO_DATA | **null**（不是 0，不是 50）| ❌ 不参与 | 灰色"暂无数据" |

**关键改动：** `ScoringService.scoreFromMetrics()` 检测到无有效指标时返回 `null`，而非默认 50。调用方拿到 null 后跳过该算子的评分聚合。

### 6.4 移除 Baseline 自比强制 100%（麦克雷 #3 — P0）

```java
// ❌ 删除这段逻辑：
if (isBaselineChip) {
    dimScores.replaceAll((k, v) -> v > 0 ? 100.0 : 0.0);
}

// ✅ 改为：保留原始计算分数（自然接近 100%）
// 如果 baseline 自比任何维度偏差 >5%，记录 WARN：
if (isBaselineChip && Math.abs(score - 100.0) > 5.0) {
    log.warn("Baseline self-comparison deviation >5%: {} score={}, 可能是数据解析bug",
             testItem, score);
}
```

### 6.5 评分可解释性（麦克雷 #6）

operatorRanking 每条增加 baseline 参考数据：

```json
{
  "testItem": "MatMul",
  "latencyMean": 2.27,
  "baselineLatency": 1.93,
  "ratio": 0.85,
  "score": 85.0,
  "dataStatus": "VALID"
}
```

用户可直接看到：被测芯片 MatMul 延迟 2.27ms，L40S 是 1.93ms，比值 0.85，评分 85。

### 6.6 维度评分

```
dimension_score = average(维度内所有 DataStatus=VALID 或 PARTIAL 的算子 score)
```

- 维度内全部 NO_DATA → 维度评分 = null（标注"暂无数据"）
- 维度内部分有数据 → 只取有数据的均值（标注覆盖率）

### 6.7 综合评分

```
overall_score = average(所有 DataStatus != NO_DATA 的算子 score)
```

### 6.8 浮点精度（麦克雷 #9）

所有 score 持久化前 `Math.round(x * 100.0) / 100.0`。消除 `100.00000000000001`。

---

## 七、Phase 4：报告组装

### 7.1 触发条件（修复 #508 + 幂等保证）

```java
// 路径 1：事件驱动
@Transactional
public void updateProgress(Long planId) {
    // Plan 完成 → 发布 PlanCompletedEvent → ReportGeneratorService 监听生成
}

// 路径 2：双保险（Recovery 定时扫描）
@Scheduled(fixedRate = 30000)
public void generateMissingReports() {
    List<EvaluationPlan> plans = planRepository
        .findByStatusAndReportIdIsNull(PlanStatus.COMPLETED);
    for (EvaluationPlan plan : plans) {
        reportGeneratorService.generateReport(plan.getId());
    }
}
```

**幂等保证（麦克雷 #7）：**
- `chip_reports` 表增加 `UNIQUE(plan_id)` 约束
- `generateReport` 入口先查 `chipReportRepository.findByPlanId(planId)`，已有则直接返回
- 并发场景由 DB unique constraint 兜底（insert 失败 → catch → 返回已有报告）

### 7.2 质量门禁（麦克雷 #4）

```java
// 报告生成后，根据覆盖率决定状态
double coverageRate = (double) validItems / totalItems * 100;

if (coverageRate < 30.0) {
    report.setStatus(ReportStatus.DRAFT);
    log.warn("Report {} coverage {}% < 30%, set to DRAFT", reportNo, coverageRate);
} else {
    report.setStatus(ReportStatus.PUBLISHED);
}
```

- **DRAFT 报告**：不对外展示（前端报告列表过滤），需管理员手动确认后改为 PUBLISHED
- **PUBLISHED 报告**：正常展示
- ChipReport.ReportStatus 枚举新增 `DRAFT`

### 7.3 失败类型区分（麦克雷 #5）

evaluation_tasks 新增 `failure_type` 字段：

| failure_type | 含义 | 触发条件 | 报告中展示 |
|-------------|------|---------|-----------|
| TIMEOUT_NOT_STARTED | 分发后从未执行 | progress=0 超时 | 灰色"未执行" |
| TIMEOUT_IN_PROGRESS | 执行中卡住 | progress>0 但超时 | 橙色"执行超时" |
| AGENT_ERROR | Agent 执行异常 | Agent 主动上报错误 | 红色"执行异常" |
| EVAL_FAILED | 评测完成但不达标 | result.status=FAILED | 红色"不达标" |

**coverage 拆分：**
```json
{
  "coverage": {
    "totalItems": 30,
    "validItems": 22,
    "partialItems": 3,
    "notStartedItems": 2,
    "evalFailedItems": 1,
    "agentErrorItems": 2,
    "coverageRate": 83.3
  }
}
```

### 7.4 报告号生成（麦克雷 #10）

```java
// ❌ 旧：RPT-{date}-{random 3 位} → 可能重复，并发不安全
// ✅ 新：RPT-{date}-{planId} → planId 天然唯一，零并发风险
private String generateReportNo(Long planId) {
    String date = DateTimeFormatter.ofPattern("yyyyMMdd")
        .withZone(ZoneId.of("Asia/Shanghai")).format(Instant.now());
    return String.format("RPT-%s-%d", date, planId);
}
```

### 7.5 报告内容结构

```json
{
  "reportNo": "RPT-20260419-2191",
  "chipId": 5,
  "planId": 2191,
  "overallScore": 85.3,
  "status": "PUBLISHED",

  "dimensionScores": {
    "compute": { "score": 92.1, "validCount": 5, "totalCount": 6 },
    "memory": { "score": 78.5, "validCount": 3, "totalCount": 4 },
    "communication": { "score": null, "validCount": 0, "totalCount": 2 },
    "op_compat": { "score": 88.7, "validCount": 4, "totalCount": 4 },
    "training": { "score": null, "validCount": 0, "totalCount": 3 },
    "inference": { "score": 85.2, "validCount": 6, "totalCount": 7 },
    "scalability": { "score": 45.0, "validCount": 1, "totalCount": 1 },
    "ecosystem": { "score": 71.4, "validCount": 1, "totalCount": 1 }
  },

  "operatorRanking": [
    {
      "rank": 1,
      "testItem": "MatMul",
      "dimension": "compute",
      "latencyMean": 1.93,
      "baselineLatency": 1.93,
      "ratio": 1.0,
      "latencyP95": 2.21,
      "throughput": 517.6,
      "score": 100.0,
      "dataStatus": "VALID"
    },
    {
      "rank": 2,
      "testItem": "MLP-Medium/batch=1",
      "dimension": "inference",
      "latencyMean": null,
      "baselineLatency": 5.12,
      "ratio": null,
      "throughput": null,
      "score": null,
      "dataStatus": "NO_DATA"
    }
  ],

  "coverage": {
    "totalItems": 17,
    "validItems": 13,
    "partialItems": 0,
    "notStartedItems": 3,
    "evalFailedItems": 1,
    "agentErrorItems": 0,
    "coverageRate": 76.5
  },

  "radarData": [...],
  "bottleneckAnalysis": [...],
  "scenarioRecommendations": [...]
}
```

---

## 八、Phase 5：存储 + 通知

### 8.1 报告存储

- `chip_reports` 表增加 `UNIQUE(plan_id)` 约束（幂等保证）
- JSON 字段做非空校验
- coverageRate ≥ 50% 时回写芯片 baseline

### 8.2 通知链路

```
Plan 完成 → 报告生成 → WebSocket 推送 → 前端自动刷新
fallback: WebSocket 断开时前端轮询 /api/plans/{id}
```

### 8.3 DRAFT 报告通知

coverageRate < 30% 的 DRAFT 报告，推送管理员审核通知（站内通知 + Dashboard 待审核列表）。

---

## 九、旧代码清理计划

| 待清理 | 说明 | 处理方式 |
|--------|------|---------|
| TaskCompleteController | 旧路径，rawData 存错 | @Deprecated + Warning header → 2 周后 410 |
| scoring/ReportGenerator.java | 已被 ReportGeneratorService 替代 | 直接删除 |
| EvaluationResultService.calculateScore() | 旧评分逻辑 | @Deprecated + delegate 到 ScoringService |
| EvaluationResultService.calculateOperatorScore() | 同上 | @Deprecated + delegate |
| EvaluationResultService.calculateModelScore() | 同上 | @Deprecated + delegate |
| isBaselineChip 强制 100% 逻辑 | 掩盖数据缺失 | 直接删除，保留偏差 >5% 告警 |
| 前端 mock 数据（10 个文件） | Math.random 假数据 | 替换为空状态展示 |

---

## 十、验证方案

### 10.1 单元测试

| 测试项 | 场景 |
|--------|------|
| MetricsNormalizer | 标准格式 / 嵌套格式 / 空输入 / snake_case / fallback 路径日志 |
| ScoringService | 有 baseline / 无 baseline / NO_DATA 返回 null / 浮点精度 |
| 报告号生成 | RPT-{date}-{planId} 格式正确 |
| 质量门禁 | coverage<30% → DRAFT / >=30% → PUBLISHED |
| failure_type | 各种超时/失败场景正确标记 |

### 10.2 集成测试（预留 2 天，接受麦克雷 #11 建议）

| 测试项 | 说明 |
|--------|------|
| 完整流程 | 创建 Plan → 执行 → 提交结果 → 报告自动生成 |
| 超时路径 | 任务超时 → Recovery FAILED → Plan 完成 → 报告生成 |
| 评分一致性 | 事件路径 vs Recovery 路径生成的报告分数一致 |
| 旧数据兼容 | 旧格式 metrics_summary 正确解析和评分 |
| 幂等性 | 并发触发 generateReport 只生成 1 份 |
| 质量门禁 | 高 NO_DATA 比例 → DRAFT 状态 |

---

## 十一、实施计划（调整后，接受麦克雷 #11 建议）

| 阶段 | 内容 | 预估 | Issue |
|------|------|------|-------|
| A | ~~#508 @Transactional + #509 progress 超时~~ | ✅ 已完成 | #508 #509 |
| B | ~~清除前端 mock 数据~~ | ✅ 已完成 | — |
| C | MetricsNormalizer + 数据归一化 | 2-3 天 | #514 |
| D | 统一评分 + score=null + 移除 baseline 强制 + 可解释性 | 1-2 天 | #515 |
| E | 废弃 TaskCompleteController + 删旧 ReportGenerator | 1 天 | #523 #516 |
| F | failure_type 区分 | 1 天 | #524 |
| G | 报告覆盖率 + 质量门禁 + 报告号 + 幂等 | 1-2 天 | #517 #518 |
| H | Agent 端输出校验 | 1 天 | #521 |
| I | E2E 集成测试 | 2 天 | #522 |
| J | 排队体验（卡顿告警 + 排队可视化） | 2-3 天 | #519 #520 |

**总预估：12-16 天**

---

## 十二、麦克雷 Review 响应跟踪

| # | 级别 | 问题 | 响应 | 在方案中的位置 |
|---|------|------|------|--------------|
| 1 | P0 | 废弃 TaskCompleteController | ✅ 采纳。加 @Deprecated + Warning → 2 周后 410 | §4.2 + §9 |
| 2 | P0 | score=50 默认值 | ✅ 采纳。NO_DATA → score=null，不参与聚合 | §6.3 |
| 3 | P0 | baseline 强制 100% | ✅ 采纳。删除强制逻辑，保留偏差 >5% WARN | §6.4 |
| 4 | P1 | 质量门禁 | ✅ 采纳。coverage<30% → DRAFT | §7.2 |
| 5 | P1 | failure_type 区分 | ✅ 采纳。4 种 failure_type + coverage 拆分 | §7.3 |
| 6 | P1 | 评分可解释性 | ✅ 采纳。operatorRanking 增加 baselineLatency + ratio | §6.5 |
| 7 | P1 | 幂等性 | ✅ 采纳。UNIQUE(plan_id) + 入口查重 | §7.1 |
| 8 | P2 | fallback 日志 | ✅ 采纳。findFirstWithLog 方法 | §5.1 |
| 9 | P2 | 浮点精度 | ✅ 采纳。roundTo2 处理 | §5.1 + §6.8 |
| 10 | P2 | 报告号并发 | ✅ 采纳。RPT-{date}-{planId} 格式 | §7.4 |
| 11 | P2 | 实施计划偏乐观 | ✅ 采纳。MetricsNormalizer 2-3 天，E2E 2 天 | §11 |

---

## 十三、Baseline 基准数据管理（v3.1 补充，chenxi 20:19 指示）

### 13.1 核心问题

当前 ScoringService 把 L40S 所有规格的评测数据混在一起取均值，不区分单卡/双卡/四卡/八卡。
导致：单卡 MatMul baseline 被 4 卡并行数据拉低 → 被测芯片单卡 score 虚高到 400%。

### 13.2 设计原则

1. **Baseline 必须按规格（run_spec）匹配** — 单卡对单卡，4 卡对 4 卡
2. **Baseline 可选择/切换** — 不硬编码 L40S，用户可在芯片管理页面设置
3. **Baseline 覆盖率透明** — 哪些算子有 baseline、哪些没有，一目了然
4. **无同规格 baseline 不评分** — 不 fallback 到 log10，直接标注"无同规格基准数据"

### 13.3 评分匹配逻辑

```
被测 Plan (run_spec = 四卡GPU, gpu_per_node=4)
  → 查找 baseline: L40S + run_spec.gpu_per_node=4 的最新 Plan
  → 只用该 Plan 的 result 作为 baseline
  → MatMul baseline = L40S 四卡 MatMul 延迟（而非所有规格的均值）
```

### 13.4 Baseline 管理（芯片管理页面）

芯片详情页新增 Baseline Tab：
- 按规格分组展示可用 baseline：单卡 / 双卡 / 四卡 / 八卡
- 每个 baseline 显示：Plan 编号、规格、评测时间、覆盖算子数/总算子数
- 用户可设置每个规格的默认 baseline Plan
- 缺失算子红色标注

### 13.5 报告中的 Baseline 标注

```json
{
  "baselineSource": {
    "chipName": "NVIDIA L40S",
    "planNo": "PLAN-20260419-021",
    "runSpec": "单卡GPU",
    "gpuPerNode": 1,
    "evaluatedAt": "2026-04-19T14:00:00Z",
    "coveredItems": 15,
    "totalItems": 17,
    "coverageRate": 88.2
  }
}
```

### 13.6 实施

Issue: #528（P0）
预估：2-3 天（后端评分重构 + 前端 baseline 管理 UI）
