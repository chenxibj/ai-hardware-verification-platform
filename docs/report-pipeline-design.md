# 评测报告全流程设计方案（v2.0）

> 📅 2026-04-19 | 作者：菜菜子
> 背景：报告生成模块反复出 bug（#508 事务缺失、#434 评分不准、#440 空数据、#470 瓶颈分析错误、#476 旧数据不兼容...），根因是全流程缺乏系统性设计，一直在打补丁。本方案重新梳理从数据采集到报告生成的完整链路，确保可靠和准确。

---

## 一、问题诊断：当前链路为什么不可靠

### 1.1 数据采集阶段的问题

| 问题 | 根因 | 影响 |
|------|------|------|
| Agent 执行了任务但 progress=0 | 初始进度上报可能失败，Recovery 误判超时 | 有效数据丢失，报告覆盖率低 |
| metrics_summary 格式不统一 | Agent 端 eval 脚本输出格式自由，后端 extractMetrics 靠猜 | 评分计算拿不到延迟/吞吐 |
| 嵌套 JSON 结构不确定 | result.eval_result.summary vs result.eval_result.results[0] vs 顶层 | flattenMetrics 需要 fallback 链 |
| snake_case vs camelCase 混用 | Agent 用 snake_case，前端用 camelCase，后端两头适配 | 字段匹配失败导致 NO_DATA |

### 1.2 评分计算阶段的问题

| 问题 | 根因 | 影响 |
|------|------|------|
| vs L40S baseline 可能没数据 | L40S 评测数据是特定 Plan 的，baseline cache 可能为空 | fallback 到旧的 log10 算法，评分不可比 |
| 维度评分只看有延迟数据的 result | lat<=0 的 result 被跳过 | 维度评分可能虚高（只算好的） |
| overallScore 计算方式不一致 | ReportGeneratorService 用 VALID 算子均值，EvaluationResultService 用维度均值 | 同一个 Plan 不同入口生成的报告分数不同 |
| 旧报告用中文 key 新报告用英文 key | DimensionRegistry 演进导致不兼容 | 前端展示报错 |

### 1.3 报告生成阶段的问题

| 问题 | 根因 | 影响 |
|------|------|------|
| PlanProgressService.updateProgress 无 @Transactional | #508：scheduler 路径不在事务中，AFTER_COMMIT 监听器不触发 | 含 failed 任务的 Plan 不生成报告 |
| 两个 ReportGenerator 共存 | 旧版 ReportGenerator (scoring 包) 和新版 ReportGeneratorService (chipreport 包) | 代码冗余，维护负担 |
| 报告号 RPT-{date}-{random} 可能重复 | Math.random() * 1000 只有 3 位 | 极端情况下报告号冲突 |
| 报告状态直接 PUBLISHED | 无草稿 → 审核 → 发布流程 | 错误报告直接可见 |

---

## 二、设计目标

1. **数据可靠**：Agent 上报的原始数据零丢失，格式有约束
2. **计算准确**：评分算法明确、可解释、可复现
3. **生成确定性**：Plan 完成 → 报告 100% 生成，无遗漏
4. **兼容性**：旧数据格式能被正确处理
5. **可观测**：每个环节有日志/状态，出问题能快速定位

---

## 三、全流程架构

```
┌──────────────────────────────────────────────────────────────────┐
│                    评测报告生成全流程                              │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│ Phase 1  │ Phase 2  │ Phase 3  │ Phase 4  │ Phase 5             │
│ 数据采集  │ 数据校验  │ 评分计算  │ 报告组装  │ 报告存储+通知        │
│          │ & 归一化  │          │          │                     │
├──────────┼──────────┼──────────┼──────────┼─────────────────────┤
│ Agent    │ Backend  │ Backend  │ Backend  │ Backend → Frontend  │
│ 执行脚本  │ Result   │ Scoring  │ Report   │ DB + WebSocket      │
│ → 上报   │ Service  │ Service  │ Generator│ 通知                │
└──────────┴──────────┴──────────┴──────────┴─────────────────────┘
```

---

## 四、Phase 1：数据采集（Agent 端）

### 4.1 评测脚本输出规范（强制约束）

**所有评测脚本必须输出以下标准化 JSON（最后一行）：**

```json
{
  "status": "COMPLETED",
  "result": {
    "eval_result": {
      "benchmark_name": "operator_benchmark",
      "config": {
        "operator": "MatMul",
        "dtype": "float32",
        "input_shape": [1024, 1024],
        "iterations": 100,
        "warmup_iterations": 10
      },
      "results": [
        {
          "operator": "MatMul",
          "status": "PASS",
          "latency_ms_mean": 1.932,
          "latency_ms_p50": 1.850,
          "latency_ms_p95": 2.210,
          "latency_ms_p99": 2.450,
          "throughput_ops": 517.6,
          "memory_mb": 256,
          "gflops": 1115.4
        }
      ],
      "summary": {
        "total_operators": 1,
        "passed": 1,
        "failed": 0,
        "avg_latency_ms": 1.932,
        "avg_throughput_ops": 517.6,
        "pass_rate": 100.0
      }
    },
    "runtime_metrics": {
      "total_duration_sec": 12.5,
      "gpu_utilization_avg": 85.2,
      "memory_utilization_avg": 43.1
    }
  }
}
```

**必填字段（缺少任一则标记为 NO_DATA）：**
- `result.eval_result.results[].latency_ms_mean` — 平均延迟
- `result.eval_result.results[].throughput_ops` — 吞吐量
- `result.eval_result.results[].status` — PASS/FAIL

### 4.2 Agent executor 改进

```
改进点：
1. 评测脚本执行前：上报 progress=1% 确认存活（已有 #494）
2. 评测脚本执行中：实时提取 progress 上报（已有 #506）
3. 评测脚本执行后：校验输出 JSON 是否包含必填字段
4. 校验失败：构造 NO_DATA 状态结果上报，附带原始 stdout
5. 网络失败：本地持久化 + 心跳重传（已有 #216/#360）
```

### 4.3 数据上报协议

```
POST /api/tasks/{taskId}/result
Content-Type: application/json

{
  "status": "COMPLETED",          # COMPLETED | FAILED
  "result": { ... },              # 标准化 JSON
  "logs": "...",                   # 执行日志（截断到 10KB）
  "agent_version": "1.3.0",       # Agent 版本号（可追溯）
  "timestamp": "2026-04-19T14:00:00Z"
}
```

---

## 五、Phase 2：数据校验 & 归一化（Backend）

### 5.1 EvaluationResultService.submitResult 改进

```java
@Transactional
public EvaluationResult submitResult(Long taskId, String rawData) {
    // 1. 解析 rawData
    Map<String, Object> data = parseRawData(rawData);
    
    // 2. 校验 & 归一化（新增）
    NormalizedMetrics normalized = MetricsNormalizer.normalize(data);
    // normalized 包含：
    //   - latencyMsMean (double, 归一化后的延迟)
    //   - latencyMsP95 (double)
    //   - latencyMsP99 (double)
    //   - throughputOps (double)
    //   - memoryMb (double)
    //   - dataStatus: VALID / NO_DATA / PARTIAL
    //   - rawMetrics: 原始数据保留
    
    // 3. 保存结果（metrics_summary 用归一化后的）
    result.setMetricsSummary(objectMapper.writeValueAsString(normalized));
    result.setDataStatus(normalized.getDataStatus());  // 新字段：数据质量标记
    
    // 4. 更新任务状态 + 触发进度检查 + Plan 完成检测
    // ... 现有逻辑
}
```

### 5.2 MetricsNormalizer（新增类）

```java
/**
 * 统一处理各种格式的 metrics 数据，输出标准化结构
 * 
 * 解决的问题：
 * 1. 嵌套 JSON 路径不一致 → 统一提取
 * 2. 字段名 snake_case/camelCase 混用 → 统一为 camelCase
 * 3. 有延迟没吞吐 or 有吞吐没延迟 → 标记 PARTIAL
 * 4. 完全没有数据 → 标记 NO_DATA
 */
public class MetricsNormalizer {

    // 延迟字段搜索优先级
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
        // 1. 尝试从多种嵌套路径提取
        Map<String, Object> flat = flattenAllPaths(rawData);
        
        // 2. 提取标准化指标
        double latencyMean = findFirst(flat, LATENCY_KEYS);
        double throughput = findFirst(flat, THROUGHPUT_KEYS);
        // ... P95, P99, memory 等
        
        // 3. 判定数据状态
        DataStatus status;
        if (latencyMean > 0 && throughput > 0) {
            status = DataStatus.VALID;
        } else if (latencyMean > 0 || throughput > 0) {
            status = DataStatus.PARTIAL;
        } else {
            status = DataStatus.NO_DATA;
        }
        
        return new NormalizedMetrics(latencyMean, ..., status, rawData);
    }
}
```

---

## 六、Phase 3：评分计算

### 6.1 评分算法：vs L40S 百分比（唯一标准）

```
score = (baseline_latency / chip_latency) × 100%

- baseline_latency: L40S 在同一算子/模型上的平均延迟
- chip_latency: 被测芯片在同一算子/模型上的平均延迟
- score > 100%: 被测芯片比 L40S 更快
- score = 100%: 与 L40S 持平
- score < 100%: 比 L40S 慢
```

**Fallback 策略（无 baseline 数据时）：**
```
1. 优先找 L40S 同名算子的 baseline
2. 次优：前缀匹配（如 "MLP-Medium/batch=4" 匹配 "MLP-Medium"）
3. 最终 fallback：基于绝对延迟的 log10 评分（0-100 分制，明确标注为"无基准对比"）
```

### 6.2 维度评分

```
dimension_score = average(所有属于该维度的算子的 score)

维度分类规则（DimensionRegistry）：
- compute: MatMul, Conv2D, GEMM, Linear, BatchMatMul
- memory: Transpose, Embedding, Concat, Gather, Scatter, Copy
- communication: AllReduce, AllGather, NCCL, P2P, Broadcast, ReduceScatter
- op_compat: ReLU, GeLU, SiLU, Softmax, LayerNorm, BatchNorm, RMSNorm, Sigmoid, Tanh
- training: Backward, Gradient, Optimizer, Adam, SGD, LossFunction
- inference: Attention, ScaledDotProduct, MLP, BERT, LLaMA, GPT, ResNet
- scalability: 基于芯片 interconnect 带宽 vs L40S 计算
- ecosystem: 基于芯片 supported precisions 数量 vs L40S 计算

特殊规则：
- 维度内所有算子都是 NO_DATA → 维度评分 = 0（标注"暂无数据"）
- 维度内只有部分算子有数据 → 只取有数据的均值（标注覆盖率）
```

### 6.3 综合评分

```
overall_score = average(所有 VALID 算子的 score)

注意：不是维度均值的均值，是所有算子的均值
原因：维度均值受维度内算子数量影响，直接算子均值更公平
```

---

## 七、Phase 4：报告组装

### 7.1 触发条件（修复 #508）

```java
// PlanProgressService.updateProgress 
// 关键修复：确保在事务上下文中执行
@Transactional
public void updateProgress(Long planId) {
    // 计算进度
    // 如果所有任务终态 → Plan 完成
    // 发布 PlanCompletedEvent
}

// 补充：双保险机制
// TaskRecoveryScheduler 中增加直接触发逻辑：
@Scheduled(fixedRate = 30000)
public void recoverTasks() {
    // 现有恢复逻辑...
    
    // 新增：检查已完成但无报告的 Plan，直接触发报告生成
    List<EvaluationPlan> completedNoReport = planRepository
        .findByStatusAndReportIdIsNull(PlanStatus.COMPLETED);
    for (EvaluationPlan plan : completedNoReport) {
        try {
            reportGeneratorService.generateReport(plan.getId());
            log.info("补生报告: plan {}", plan.getPlanNo());
        } catch (Exception e) {
            log.warn("补生报告失败: plan {} - {}", plan.getPlanNo(), e.getMessage());
        }
    }
}
```

### 7.2 报告内容结构

```json
{
  "reportNo": "RPT-20260419-001",
  "chipId": 5,
  "planId": 2191,
  "overallScore": 85.3,
  "status": "PUBLISHED",
  
  "dimensionScores": {
    "compute": 92.1,
    "memory": 78.5,
    "communication": 0,
    "op_compat": 88.7,
    "training": 0,
    "inference": 85.2,
    "scalability": 45.0,
    "ecosystem": 71.4
  },
  
  "operatorRanking": [
    {
      "rank": 1,
      "testItem": "MatMul",
      "dimension": "compute",
      "latencyMean": 1.93,
      "latencyP95": 2.21,
      "latencyP99": 2.45,
      "throughput": 517.6,
      "score": 98.5,
      "passed": true,
      "dataStatus": "VALID"
    }
  ],
  
  "radarData": [...],
  "bottleneckAnalysis": [...],
  "scenarioRecommendations": [...],
  "coverage": {
    "totalItems": 30,
    "validItems": 25,
    "noDataItems": 3,
    "failedItems": 2,
    "coverageRate": 83.3,
    "isComplete": true
  }
}
```

### 7.3 报告号生成改进

```java
// 旧：RPT-{date}-{random 3 位} → 可能重复
// 新：RPT-{date}-{sequence from DB} → 保证唯一
private String generateReportNo() {
    String date = DateTimeFormatter.ofPattern("yyyyMMdd")
        .withZone(ZoneId.of("Asia/Shanghai")).format(Instant.now());
    long count = reportRepository.countByReportNoStartsWith("RPT-" + date);
    return String.format("RPT-%s-%03d", date, count + 1);
}
```

---

## 八、Phase 5：存储 + 通知

### 8.1 报告存储

- 报告主体存 `chip_reports` 表
- JSON 字段（dimension_scores, operator_ranking 等）做非空校验
- Baseline 自动标记：覆盖率 ≥ 50% 时设为 baseline 并回写芯片画像

### 8.2 通知链路

```
Plan 完成 → 报告生成 → WebSocket 推送前端 → 前端自动刷新报告列表

补充：如果 WebSocket 断开，前端轮询 /api/plans/{id} 作为 fallback
```

---

## 九、旧代码清理计划

| 待清理 | 说明 | 优先级 |
|--------|------|--------|
| `scoring/ReportGenerator.java`（@Deprecated） | 已被 ReportGeneratorService 替代，但仍存在 | P1 — 删除 |
| `EvaluationResultService.calculateScore()` | 旧的绝对值评分，与 ScoringService 重复 | P1 — 统一到 ScoringService |
| 前端 mock 数据（10 个文件） | AssetBackup/AssetValidation/StorageMonitor 等用 Math.random | P0 — 立即清除 |
| `PlanProgressService` 缺 @Transactional | #508 根因 | P0 — 立即修复 |

---

## 十、验证方案

### 10.1 单元测试

```
1. MetricsNormalizer 测试：
   - 标准格式输入 → 正确提取
   - 嵌套格式输入 → 正确提取
   - 空/null 输入 → NO_DATA
   - snake_case 输入 → 正确归一化为 camelCase

2. ScoringService 测试：
   - 有 baseline 数据 → vs L40S 百分比
   - 无 baseline 数据 → fallback log10
   - 边界值：latency=0, throughput=0

3. ReportGeneratorService 测试：
   - Plan 全部 VALID → 完整报告
   - Plan 部分 NO_DATA → 报告有覆盖率标注
   - Plan 全部 FAILED → 报告 overallScore=0
```

### 10.2 集成测试

```
1. 完整流程测试：创建 Plan → 执行任务 → 提交结果 → 自动生成报告
2. 超时路径测试：任务超时 → Recovery 标记 FAILED → Plan 完成 → 报告生成
3. 报告内容校验：维度评分 + 算子排行 + 瓶颈分析 + 场景推荐 内容合理性
```

---

## 十一、实施计划

| 阶段 | 内容 | 时间 |
|------|------|------|
| Phase A | 修 #508（@Transactional）+ #509（progress 超时） | 立即 |
| Phase B | 清除所有前端 mock 数据 | 立即 |
| Phase C | 新增 MetricsNormalizer，统一数据入口 | 1-2天 |
| Phase D | 清理旧 ReportGenerator + 统一评分逻辑 | 1天 |
| Phase E | 补全单元测试 + 集成测试 | 1天 |
| Phase F | 双保险报告触发 + 报告号唯一性 | 0.5天 |

---

*本方案覆盖了从 Agent 数据采集、后端数据校验归一化、评分计算、报告组装到存储通知的完整链路。核心改进点是：数据格式强约束 + 归一化层 + 评分算法统一 + 触发双保险 + 旧代码清理。*


---

## 📝 Review Comments（麦克雷）

> 基于 2026-04-19 L40S Round 4 实测数据 + 后端代码深度分析
> Review 时间：2026-04-19 14:40

---

### 🔴 P0 — 必须解决的设计缺陷

#### 1. 缺少 `TaskCompleteController` 旧路径的处理方案

方案只提了统一走 `/tasks/{id}/result`，但没有明确说要废弃 `POST /tasks/{id}/complete`（TaskCompleteController）。这条旧路径的问题是 `result.setRawData(metricsSummary)`——把摘要当原始数据存了，下游 flattenMetrics 解析不到真实指标。

> **建议**：方案中应明确列出"废弃 TaskCompleteController"，加一个 deprecation 阶段（先返回 warning header，2 周后直接 410 Gone）。

#### 2. `score=50` 默认值陷阱没有解决

方案里 `MetricsNormalizer` 引入了 `DataStatus.NO_DATA`，但 `ScoringService.scoreFromMetrics()` 在无法识别指标时仍然会返回什么？如果还是 50，那 NO_DATA 的 result 仍然会有一个"看起来有效"的 50 分。

> **建议**：明确规定——`DataStatus=NO_DATA` 的 result，score 必须设为 `null`（而非 0 或 50）。报告中 NO_DATA 算子不参与 overallScore 计算，维度评分只算 VALID 的。方案 6.3 说"所有 VALID 算子的均值"是对的，但需要和 DataStatus 联动。

#### 3. Baseline 自比的 100% 强制逻辑是否保留？

方案没提到现有的 `if (isBaselineChip) dimScores.replaceAll((k, v) -> v > 0 ? 100.0 : 0.0)` 逻辑。今天实测发现 MLP 系列 `latency=NULL, throughput=NULL` 但 score=100（被 baseline 强制逻辑覆盖），掩盖了数据缺失问题。

> **建议**：baseline 自比时**不做强制 100%**，保留原始计算分数（正常情况自然接近 100%）。如果 baseline 自比偏差 >5%，应触发告警——说明评测脚本或数据解析有 bug。

---

### 🟡 P1 — 应补充的设计点

#### 4. 报告生成的前置质量门禁

方案 7.1 说"Plan 完成 → 100% 生成报告"，但没有最低数据质量门禁。如果一个 Plan 17 个任务有 15 个 NO_DATA（比如 Agent 全面故障），生成的报告毫无参考价值。

> **建议**：增加质量门禁——`coverageRate < 30%` 时报告状态设为 `DRAFT`（不对外展示），需人工确认后发布。`coverage.isComplete` 阈值 80% 已有，但缺少低覆盖率的阻断逻辑。

#### 5. `failure_type` 区分缺失

方案 1.1 诊断了 "progress=0 误判超时" 问题，但报告生成时仍然只看 `passed=true/false`。今天实测 8 个 failed 任务全是"任务分发但未执行"（NOT_STARTED），跟"评测跑了但不达标"（EVAL_FAILED）性质完全不同。

> **建议**：
> - evaluation_tasks 增加 `failure_type` enum: `TIMEOUT_NOT_STARTED` / `TIMEOUT_IN_PROGRESS` / `AGENT_ERROR` / `EVAL_FAILED`
> - 报告中区分展示：NOT_STARTED 标记为"未执行"（灰色），EVAL_FAILED 标记为"不达标"（红色）
> - `coverage.failedItems` 拆分为 `notStartedItems` + `evalFailedItems`

#### 6. 评分可解释性不足

方案 6.1 定义了评分算法 `score = baseline_latency / chip_latency × 100%`，但报告结构（7.2 operatorRanking）只有被测芯片的延迟和分数，**缺少 baseline 参考值**。用户看到 score=85.2 不知道 L40S 的参考延迟是多少。

> **建议**：operatorRanking 每条增加 `baselineLatency`、`ratio` 字段：
> ```json
> {
>   "testItem": "MatMul",
>   "latencyMean": 2.27,
>   "baselineLatency": 1.93,
>   "ratio": 0.85,
>   "score": 85.0
> }
> ```

#### 7. 双保险机制的幂等性

方案 7.1 中 `TaskRecoveryScheduler` 每 30 秒扫描"已完成但无报告的 Plan"并触发生成。如果 `generateReport` 正在异步执行中（还没写 DB），下一次 30 秒又触发一次，会不会生成两份报告？

> **建议**：`generateReport` 入口加分布式锁（或 DB unique constraint on plan_id）+ 幂等检查。`chip_reports` 表加 `UNIQUE(plan_id)` 约束。

---

### 🟢 P2 — 建议优化

#### 8. MetricsNormalizer 的 fallback 链应有日志

方案里 `LATENCY_KEYS` 和 `THROUGHPUT_KEYS` 有多个 fallback 字段名。如果走了非首选路径（比如用了 `latency_ms_p50` 代替 `latency_ms_mean`），应该记录 INFO 日志以便追溯。

#### 9. 浮点精度处理

今天实测 score 显示 `100.00000000000001`。虽然前端展示会 round，但 DB 和 API 返回中这个值会困惑调用方。

> **建议**：`NormalizedMetrics` 中所有 double 字段在持久化前 `Math.round(x * 100.0) / 100.0`（保留 2 位小数）。

#### 10. 报告号的并发安全

方案 7.3 用 `countByReportNoStartsWith` 生成序号，但并发生成时两个线程可能拿到相同 count。

> **建议**：用 DB sequence 或 `SELECT MAX(...)` + pessimistic lock，或者直接用 `RPT-{date}-{planId}` 格式（planId 天然唯一）。

#### 11. 实施计划偏乐观

"Phase C: MetricsNormalizer 1-2 天" — 考虑到要处理所有历史格式兼容 + 写测试，建议预留 2-3 天。"Phase E: 补全测试 1 天" — 集成测试涉及 Agent+Backend+DB 联调，至少 2 天。

---

### 📊 今天实测数据佐证

| 现象 | 对应方案哪个 Phase | 是否已覆盖 |
|------|-------------------|-----------|
| MLP score=100 但 latency=NULL | Phase 3 评分 | ⚠️ 未覆盖 baseline 强制逻辑 |
| 3 个 failed 任务 raw_data=NULL | Phase 2 校验 | ✅ DataStatus=NO_DATA |
| 只有 T2 生成报告（#508） | Phase 4 触发 | ✅ 双保险 |
| score=100.00000000000001 | Phase 3 | ❌ 未提及精度处理 |
| MLP 有 score 但无 latency/throughput | Phase 2 归一化 | ⚠️ 需要和 baseline 逻辑联动 |

---

### 总结

方案架构是好的，5 个 Phase 分层清晰。核心要补的是：废弃旧路径的明确计划、score 默认值处理、baseline 强制逻辑的重新考量、质量门禁、failure_type 区分。这些都是今天实测实打实发现的问题。
