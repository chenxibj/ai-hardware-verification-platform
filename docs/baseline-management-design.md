# Baseline 基准数据管理设计文档

> 📅 2026-04-19 | 作者：[菜菜子]
> Issue: #528 | 关联：docs/report-pipeline-design.md v3.1 §13

---

## 一、问题陈述

### 1.1 核心问题

评测评分公式为 `score = baseline_latency / chip_latency × 100%`，其中 baseline 数据的质量直接决定评分是否有意义。当前存在三个致命缺陷：

**① baseline 不区分卡数规格 → 400% 虚高评分**

L40S 在数据库中有 5 种规格的评测数据：

| 规格 (run_spec) | gpu_per_node | 已完成算子/规格 | 评测结果数 |
|-----------------|-------------|---------------|-----------|
| 单卡GPU (gpu-1) | 1 | 17/17 | 187 |
| 双卡DDP (gpu-2-ddp) | 2 | 17/17 | 51 |
| 四卡GPU (gpu-4) | 4 | 17/17 | 102 |
| 八卡GPU (gpu-8) | 8 | 17/17 | 17 |
| 纯CPU (cpu-1) | 0 | 17/17 | 34 |

`ScoringService.getBaselineLatencyMap()` 把**所有规格的同名算子延迟混在一起取均值**。

举例：MatMul 单卡延迟 ~2ms，4 卡并行延迟 ~0.5ms → 混合均值 ~1.2ms → 被测芯片单卡跑出 2ms 对比这个 1.2ms → score = 1.2/2 × 100% = 60%（偏低）。反之，被测芯片 4 卡跑出 0.5ms 对比 1.2ms → score = 1.2/0.5 = 240%（虚高）。

**② baseline 来源不透明**

- 硬编码 `chipRepository.findByNameContainingIgnoreCase("L40S")` 搜索
- 用户不知道 baseline 来自哪次评测、什么配置、什么时间
- 无法选择或切换 baseline

**③ baseline 覆盖率不可见**

- 不知道 baseline 覆盖了哪些算子
- 缺失的算子 fallback 到 log10 评分，和有 baseline 的算子分数不在同一量纲

### 1.2 影响范围

- 所有芯片的评分报告
- 芯片排行榜
- 维度评分
- 报告中的瓶颈分析和场景推荐

---

## 二、设计目标

1. **规格隔离**：评分时严格按 run_spec 匹配 baseline，单卡对单卡、4 卡对 4 卡
2. **可选择可切换**：用户可在芯片管理页面查看和切换每个规格的默认 baseline
3. **覆盖率透明**：每个规格的 baseline 覆盖了哪些算子、缺了哪些，一目了然
4. **来源可追溯**：报告中标注 baseline 来自哪个 Plan、什么规格、什么时间
5. **向前兼容**：旧报告不受影响，新报告在 baselineSource 中记录来源

---

## 三、数据模型

### 3.1 现有结构

```
chips (芯片)
  └── evaluation_plans (评测方案)
        ├── run_spec_id → run_specs (运行规格: gpu_per_node, node_count, parallel_mode)
        └── evaluation_tasks (评测任务)
              └── evaluation_results (评测结果: metrics_summary, score)

chip_reports (评测报告)
  ├── chip_id
  ├── plan_id
  ├── is_baseline (boolean)
  └── overall_score, dimension_scores, operator_ranking
```

### 3.2 新增/改造

#### 方案 A：新增 baseline_configs 表（推荐）

```sql
CREATE TABLE baseline_configs (
  id            BIGSERIAL PRIMARY KEY,
  chip_id       BIGINT NOT NULL REFERENCES chips(id),       -- 基准芯片（如 L40S）
  run_spec_id   BIGINT NOT NULL REFERENCES run_specs(id),   -- 运行规格
  plan_id       BIGINT NOT NULL REFERENCES evaluation_plans(id), -- 指定的基准 Plan
  is_default    BOOLEAN DEFAULT false,                       -- 是否为该规格的默认 baseline
  set_by        VARCHAR(100),                                -- 设置人
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(chip_id, run_spec_id, plan_id)
);

-- 每个芯片+规格组合最多一个 default
CREATE UNIQUE INDEX idx_baseline_default 
  ON baseline_configs(chip_id, run_spec_id) WHERE is_default = true;
```

#### chip_reports 新增字段

```sql
ALTER TABLE chip_reports ADD COLUMN baseline_source JSONB;
-- 记录报告生成时使用的 baseline 信息
```

baseline_source 结构：
```json
{
  "chipId": 5,
  "chipName": "NVIDIA L40S",
  "planId": 2225,
  "planNo": "PLAN-20260419-021",
  "runSpecId": 13,
  "runSpecName": "单卡GPU",
  "gpuPerNode": 1,
  "evaluatedAt": "2026-04-19T14:00:00Z",
  "coveredItems": 15,
  "totalItems": 17,
  "coverageRate": 88.2,
  "missingItems": ["Conv2D", "Softmax"]
}
```

---

## 四、后端设计

### 4.1 ScoringService 改造（核心）

**当前逻辑（有问题）：**
```java
// 混合所有规格数据
private Map<String, Double> getBaselineLatencyMap() {
    List<Chip> l40sChips = chipRepository.findByNameContainingIgnoreCase("L40S");
    // ... 遍历所有 Plan 的所有 result，不区分规格
}
```

**改造后：**
```java
/**
 * 按 run_spec 获取 baseline latency map
 * 
 * @param runSpecId 被测 Plan 的运行规格 ID
 * @return testItem -> baseline latency (ms) 的映射
 */
public Map<String, Double> getBaselineLatencyMap(Long runSpecId) {
    // 1. 查 baseline_configs 表，找该规格的 default baseline
    BaselineConfig config = baselineConfigRepository
        .findByRunSpecIdAndIsDefaultTrue(runSpecId)
        .orElse(null);
    
    if (config == null) {
        // 2. fallback：找 L40S 同规格最新 COMPLETED Plan
        config = findLatestL40SPlan(runSpecId);
    }
    
    if (config == null) {
        log.warn("No baseline found for runSpec {}", runSpecId);
        return Collections.emptyMap();  // 无 baseline → 所有算子 score=null
    }
    
    // 3. 只从指定 Plan 提取 baseline 数据（不混合其他规格）
    return extractLatencyMapFromPlan(config.getPlanId());
}

/**
 * 评分入口改造：接受 runSpecId 参数
 */
public Double scoreFromMetrics(String metricsSummary, String testItem, Long runSpecId) {
    Map<String, Double> baseline = getBaselineLatencyMap(runSpecId);
    Double baselineLatency = baseline.get(testItem);
    
    if (baselineLatency == null) {
        // 尝试前缀匹配
        baselineLatency = findByPrefix(baseline, testItem);
    }
    
    if (baselineLatency == null) {
        return null;  // 无同规格 baseline，不评分，不 fallback
    }
    
    double chipLatency = extractLatency(metricsSummary);
    if (chipLatency <= 0) return null;
    
    double score = (baselineLatency / chipLatency) * 100.0;
    return Math.round(score * 100.0) / 100.0;
}
```

**关键改动：**
- `getBaselineLatencyMap()` 改为接受 `runSpecId` 参数
- 只从 baseline_configs 指定的 Plan（或同规格最新 Plan）提取数据
- 无同规格 baseline 时返回 `null`，**不 fallback 到 log10**

### 4.2 Baseline 管理 API

```
GET    /api/baselines                        -- 列出所有 baseline 配置
GET    /api/baselines/chip/{chipId}           -- 某芯片的所有 baseline（按规格分组）
GET    /api/baselines/coverage                -- baseline 覆盖率查询
         ?chipId=5&runSpecId=13
POST   /api/baselines                        -- 创建/更新 baseline 配置
         { chipId, runSpecId, planId, isDefault }
DELETE /api/baselines/{id}                   -- 删除 baseline 配置

GET    /api/baselines/auto-detect            -- 自动检测可用 baseline
         ?chipId=5                            -- 返回每个规格的最新可用 Plan
```

#### 响应示例

**GET /api/baselines/chip/5**
```json
{
  "chipId": 5,
  "chipName": "NVIDIA L40S",
  "specs": [
    {
      "runSpecId": 13,
      "runSpecName": "单卡GPU",
      "gpuPerNode": 1,
      "defaultBaseline": {
        "planId": 2225,
        "planNo": "PLAN-20260419-021",
        "evaluatedAt": "2026-04-19T14:00:00Z",
        "coveredItems": 17,
        "totalItems": 17,
        "coverageRate": 100.0,
        "isAutoDetected": true
      },
      "availablePlans": [
        { "planId": 2225, "planNo": "PLAN-20260419-021", "evaluatedAt": "...", "coverageRate": 100.0 },
        { "planId": 2220, "planNo": "PLAN-20260419-991", "evaluatedAt": "...", "coverageRate": 94.1 }
      ]
    },
    {
      "runSpecId": 15,
      "runSpecName": "四卡GPU",
      "gpuPerNode": 4,
      "defaultBaseline": {
        "planId": 2199,
        "planNo": "PLAN-20260419-968",
        "evaluatedAt": "2026-04-19T05:27:20Z",
        "coveredItems": 15,
        "totalItems": 17,
        "coverageRate": 88.2,
        "missingItems": ["MLP-Medium/batch=1", "MLP-Medium/batch=16"]
      },
      "availablePlans": [...]
    }
  ]
}
```

**GET /api/baselines/coverage?chipId=5&runSpecId=13**
```json
{
  "runSpecName": "单卡GPU",
  "gpuPerNode": 1,
  "items": [
    { "testItem": "MatMul",    "hasBaseline": true,  "latencyMs": 1.93, "resultCount": 5 },
    { "testItem": "Conv2D",    "hasBaseline": true,  "latencyMs": 3.45, "resultCount": 6 },
    { "testItem": "GELU",      "hasBaseline": true,  "latencyMs": 0.12, "resultCount": 8 },
    { "testItem": "Softmax",   "hasBaseline": false, "latencyMs": null, "resultCount": 0 }
  ],
  "coveredCount": 16,
  "totalCount": 17,
  "coverageRate": 94.1
}
```

### 4.3 ReportGeneratorService 改造

```java
public ChipReport generateReport(Long planId) {
    EvaluationPlan plan = planRepository.findById(planId).orElseThrow();
    Long runSpecId = plan.getRunSpecId();
    
    // 1. 获取同规格 baseline
    Map<String, Double> baseline = scoringService.getBaselineLatencyMap(runSpecId);
    BaselineConfig baselineConfig = baselineConfigRepository
        .findByRunSpecIdAndIsDefaultTrue(runSpecId).orElse(null);
    
    // 2. 评分时传入 runSpecId
    for (EvaluationResult result : results) {
        Double score = scoringService.scoreFromMetrics(
            result.getMetricsSummary(), testItem, runSpecId);
        // ...
    }
    
    // 3. 记录 baseline 来源
    report.setBaselineSource(buildBaselineSource(baselineConfig, baseline));
    
    // ...
}
```

### 4.4 自动检测逻辑

当 baseline_configs 表无记录时，系统自动检测可用 baseline：

```java
/**
 * 自动检测：找 L40S 同规格最新 COMPLETED Plan
 */
private BaselineConfig findLatestL40SPlan(Long runSpecId) {
    List<Chip> l40sChips = chipRepository.findByNameContainingIgnoreCase("L40S");
    if (l40sChips.isEmpty()) return null;
    
    Set<Long> l40sChipIds = l40sChips.stream().map(Chip::getId).collect(toSet());
    
    // 找同规格最新已完成 Plan
    return planRepository.findFirstByChipIdInAndRunSpecIdAndStatusOrderByCompletedAtDesc(
        l40sChipIds, runSpecId, PlanStatus.COMPLETED
    ).map(plan -> {
        BaselineConfig auto = new BaselineConfig();
        auto.setChipId(plan.getChipId());
        auto.setRunSpecId(runSpecId);
        auto.setPlanId(plan.getId());
        auto.setIsDefault(false);  // 自动检测的不标记为 default
        return auto;
    }).orElse(null);
}
```

---

## 五、前端设计

### 5.1 芯片管理页面 — 新增 Baseline Tab

**入口：** 芯片详情页 → 新 Tab "基准数据"

**页面布局：**

```
┌─────────────────────────────────────────────────┐
│  芯片详情: NVIDIA L40S                            │
│  [基本信息] [评测历史] [基准数据] [排行]           │
├─────────────────────────────────────────────────┤
│                                                   │
│  📊 基准数据管理                                   │
│                                                   │
│  ┌─ 单卡GPU (gpu-1) ──────────────────────────┐  │
│  │ 默认基准: PLAN-20260419-021 (R6-T1)         │  │
│  │ 评测时间: 2026-04-19 14:00                   │  │
│  │ 覆盖率: 17/17 (100%) ████████████████ ✅     │  │
│  │                                              │  │
│  │ [切换基准 ▾]  [查看覆盖详情]                  │  │
│  └──────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ 四卡GPU (gpu-4) ──────────────────────────┐  │
│  │ 默认基准: PLAN-20260419-968 (R4-T3)         │  │
│  │ 评测时间: 2026-04-19 05:27                   │  │
│  │ 覆盖率: 15/17 (88.2%) ██████████████░░ ⚠️   │  │
│  │ 缺失: MLP-Medium/batch=1, batch=16          │  │
│  │                                              │  │
│  │ [切换基准 ▾]  [查看覆盖详情]                  │  │
│  └──────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ 八卡GPU (gpu-8) ──────────────────────────┐  │
│  │ 默认基准: 自动检测 (PLAN-20260419-xxx)       │  │
│  │ 覆盖率: 17/17 (100%) ████████████████ ✅     │  │
│  │ ⚠️ 仅 1 轮数据，建议多轮验证                  │  │
│  │                                              │  │
│  │ [设为默认]  [查看覆盖详情]                     │  │
│  └──────────────────────────────────────────────┘  │
│                                                   │
│  ℹ️ 无基准数据的规格: 双机四卡, 四机八卡           │
│     这些规格的评分将标注"无同规格基准数据"          │
│                                                   │
└─────────────────────────────────────────────────┘
```

### 5.2 切换基准 — 下拉弹窗

点击 [切换基准 ▾] 弹出可用 Plan 列表：

```
┌─ 选择单卡GPU基准 Plan ─────────────────────────┐
│                                                 │
│  ○ PLAN-20260419-021 (R6-T1) ← 当前默认        │
│    2026-04-19 14:00 | 覆盖 17/17 (100%)         │
│                                                 │
│  ○ PLAN-20260419-991 (R5-T1)                    │
│    2026-04-19 12:30 | 覆盖 16/17 (94.1%)        │
│    缺失: Softmax                                │
│                                                 │
│  ○ PLAN-20260419-372 (R4-T1)                    │
│    2026-04-19 05:00 | 覆盖 15/17 (88.2%)        │
│                                                 │
│            [确认切换]  [取消]                     │
└─────────────────────────────────────────────────┘
```

### 5.3 覆盖详情弹窗

点击 [查看覆盖详情] 展示算子级别的 baseline 数据：

```
┌─ 单卡GPU 基准覆盖详情 ──────────────────────────┐
│                                                  │
│  算子            延迟(ms)  吞吐(ops)  数据轮次    │
│  ─────────────────────────────────────────────   │
│  ✅ MatMul       1.93      517.6      5轮        │
│  ✅ Conv2D       3.45      289.1      6轮        │
│  ✅ GELU         0.12      8333.3     8轮        │
│  ✅ ReLU         0.08      12500.0    8轮        │
│  ✅ Softmax      0.45      2222.2     6轮        │
│  ... (更多)                                      │
│  ❌ Transpose    —         —          0轮        │
│                                                  │
│  覆盖率: 16/17 (94.1%)                           │
│                                                  │
│                             [关闭]                │
└──────────────────────────────────────────────────┘
```

### 5.4 报告详情页 — Baseline 来源标注

在报告详情页顶部增加 baseline 信息卡片：

```
┌─ 📊 评分基准 ──────────────────────────────────┐
│  基准芯片: NVIDIA L40S                          │
│  基准规格: 单卡GPU (gpu-1)                      │
│  基准 Plan: PLAN-20260419-021                    │
│  评测时间: 2026-04-19 14:00                      │
│  覆盖率: 17/17 (100%)                           │
│                                                  │
│  ℹ️ 所有评分基于"被测芯片 vs L40S 同规格"计算    │
└──────────────────────────────────────────────────┘
```

每个算子评分旁显示规格标签：`score: 85.2 (vs L40S 单卡)`

---

## 六、评分匹配规则（完整）

### 6.1 匹配流程

```
被测 Plan (chip=某国产芯片, run_spec=四卡GPU, gpu_per_node=4)
  │
  ├─ Step 1: 查 baseline_configs 表
  │    WHERE run_spec_id = 被测Plan.run_spec_id AND is_default = true
  │    → 找到 → 用该 Plan 的数据作为 baseline
  │
  ├─ Step 2: 自动检测
  │    找 L40S + 同 run_spec_id + status=COMPLETED 的最新 Plan
  │    → 找到 → 用该 Plan 的数据作为 baseline
  │
  └─ Step 3: 无 baseline
       → 所有算子 score = null
       → 报告标注"无同规格基准数据"
       → 不使用 log10 fallback
```

### 6.2 特殊场景处理

| 场景 | 处理 |
|------|------|
| 被测芯片就是 L40S（自比） | 正常匹配同规格 baseline，自比 score ≈ 100%。偏差 >5% 记录 WARN |
| Baseline Plan 只覆盖部分算子 | 有 baseline 的算子正常评分，无 baseline 的算子 score=null + 标注"基准数据缺失" |
| 多机规格 (multi-2x4) | 用 multi-2x4 的 baseline，不用单机 gpu-4。node_count 和 gpu_per_node 都要匹配 |
| CPU-only 规格 | 用 cpu-1 baseline。CPU 和 GPU 评分不混合 |
| 新增规格没有任何 baseline | 所有算子 score=null，报告建议"请先跑一轮 L40S 基准评测" |

### 6.3 baseline_configs 自动初始化

首次部署时，系统自动扫描已有 L40S 评测数据，为每个规格创建 baseline_config 记录（is_default=true），选择该规格最新 COMPLETED 的 Plan。

---

## 七、API 变更影响评估

| 现有 API | 变更 | 影响 |
|----------|------|------|
| ScoringService.scoreFromMetrics(metrics, testItem) | 新增参数 runSpecId | 所有评分调用方需传入 runSpecId |
| ScoringService.getBaselineLatencyMap() | 改为 getBaselineLatencyMap(runSpecId) | 评分隔离，不再混合规格 |
| ReportGeneratorService.generateReport(planId) | 自动从 Plan 获取 runSpecId | 内部改造，外部接口不变 |
| ChipReport | 新增 baseline_source 字段 (JSONB) | 前端报告详情页需适配 |
| 芯片管理页面 | 新增 Baseline Tab | 新功能，不影响现有功能 |

---

## 八、实施计划

| 阶段 | 内容 | 预估 | 依赖 |
|------|------|------|------|
| 1 | 创建 baseline_configs 表 + Entity + Repository | 0.5 天 | 无 |
| 2 | ScoringService 改造：按 runSpecId 匹配 | 1 天 | 阶段 1 |
| 3 | Baseline 管理 API (CRUD + 覆盖率 + 自动检测) | 1 天 | 阶段 1 |
| 4 | ReportGeneratorService 改造 + baselineSource | 0.5 天 | 阶段 2 |
| 5 | 前端芯片管理 Baseline Tab | 1 天 | 阶段 3 |
| 6 | 前端报告详情 baseline 标注 | 0.5 天 | 阶段 4 |
| 7 | 自动初始化 + 数据迁移 | 0.5 天 | 阶段 1-4 |
| 8 | 测试（单元 + 集成） | 1 天 | 阶段 1-7 |

**总预估：5-6 天**

---

## 九、验收标准

- [ ] 单卡 Plan 评分只用单卡 L40S baseline（不混合多卡数据）
- [ ] 芯片管理页面可查看每个规格的 baseline 覆盖情况
- [ ] 用户可切换每个规格的默认 baseline Plan
- [ ] 报告中展示 baseline 来源（芯片、规格、Plan、时间、覆盖率）
- [ ] 无同规格 baseline 时 score=null，报告标注"无同规格基准数据"
- [ ] Baseline 覆盖详情可展开查看每个算子的 baseline 数据
- [ ] 首次部署自动初始化 baseline_configs
- [ ] 旧报告不受影响
