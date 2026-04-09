# 任务：评测报告状态不一致修复 + 覆盖度说明 + 六维评测方法详解

## 状态：✅ 完成

## 时间线
- 2026-04-09 01:04 — 任务开始
- 2026-04-09 01:08 — 后端 patch 1: 三态判定 + 覆盖度计算
- 2026-04-09 01:10 — 后端 patch 2: 六维详细说明 + EvaluationResultService 修复
- 2026-04-09 01:12 — 前端 ChipReport.js 全量修改（12 处改动）
- 2026-04-09 01:13 — 前端 PlanMonitor.js 任务异常标签
- 2026-04-09 01:15 — 后端构建成功，部署
- 2026-04-09 01:15 — 前端构建成功，部署
- 2026-04-09 01:17 — 报告重新生成：Plan 296 → RPT-20260409-931
- 2026-04-09 01:18 — Git push 完成

## 核心问题 (已修复)
Plan 296 有 9 个任务全部 COMPLETED，但旧报告显示 5 个算子"失败"。
原因：5 个 OPERATOR 任务的 metrics_summary 无性能数据（latency=0, throughput=0），报告直接判 score=0 → passed=false。

## 改动清单

### 后端 (3 文件)

1. **ReportGeneratorService.java** — `buildOperatorRanking()`
   - 三态判定：VALID / NO_DATA / FAILED
   - VALID: avgLatency > 0 && throughput > 0 → 正常评分
   - NO_DATA: Agent 报告 passed 但无性能数据，或无 error 也无数据 → score=null
   - FAILED: 有 errorMessage → score=0
   - 新增 `dataStatus` 字段到每个算子条目

2. **ReportGeneratorService.java** — `generateReport()`
   - overallScore 仅基于 VALID 条目计算（94.2 vs 旧 15.7）
   - 新增 coverage 数据：totalItems/validItems/noDataItems/failedItems/coverageRate
   - Coverage 注入 bottleneckAnalysis 作为特殊 type="coverage" 条目

3. **ReportGeneratorService.java** — `buildRadarData()`
   - 六维雷达图增加 `detail` 字段，包含：
     - name, description, evalMethod, scoringBasis, scoringStandard, coveredOperators
   - 增加 `dimKey` 字段用于前端关联

4. **ReportGeneratorService.java** — `buildBottleneckAnalysis()`
   - 最差算子排行只考虑 VALID 条目

5. **EvaluationResultService.java** — `calculateDimensionScores()`
   - 跳过 latency <= 0 的结果（NO_DATA 不影响维度评分）

### 前端 (2 文件)

6. **ChipReport.js** — 12 处改动：
   - 导入 Collapse, Tooltip, InfoCircleOutlined, QuestionCircleOutlined
   - 精度数据提取排除 NO_DATA 项
   - 算子排行"评分"列：NO_DATA 显示 "—"
   - 算子排行"状态"列：四态（✅通过 / ❌未达标 / ⚠️无有效数据 / ❌评测失败）
   - 模型评测表状态列同步修复
   - 统计行：有效数据 / 通过率 / 无数据+失败 / 报告状态
   - 覆盖度 Alert 提示条（绿色/黄色）
   - 雷达图标题增加评分公式说明 + 问号 tooltip
   - 评分等级色带说明
   - 雷达图下方折叠面板：每个维度的评测方法详解
   - 延迟柱状图只显示 VALID 项
   - CSV 导出增加 dataStatus 列
   - 瓶颈分析过滤 coverage 类型条目

7. **PlanMonitor.js** — 任务列表显示异常概要：
   - COMPLETED 但无性能指标 → 显示 "⚠️ 无性能指标" Tag

## 重新生成的报告
- 旧报告：RPT-20260408-703，overallScore=15.7（已删除）
- 新报告：RPT-20260409-931，overallScore=94.2
  - 4 VALID（4个MLP模型评测有真实数据）
  - 5 NO_DATA（MatMul, Conv2D, Softmax, ReLU, LayerNorm 无性能指标）
  - 0 FAILED
  - 覆盖度：44.4%

## Git
- Commit: d2cf76bf
- Message: feat: 评测报告三态判定（VALID/NO_DATA/FAILED）+ 覆盖度说明 + 六维评测方法详解 + 任务异常概要
