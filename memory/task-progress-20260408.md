# 任务进度 - 2026-04-08

## ✅ 修复算子性能排行延迟数据全为0的bug

**状态:** 已完成并验证  
**Commit:** 53742e38  
**时间:** 11:20 完成

### 根因（最终定位）
metrics_summary 的 JSON 结构是嵌套的，不是扁平的：
```json
{
  "logs": "...",
  "score": 50.0,
  "result": {
    "eval_result": {
      "summary": {"avg_latency_ms": 2.288, ...},
      "results": [{"latency_ms_mean": 2.288, "latency_ms_p95": 3.14, "throughput_ops": 436.5, ...}]
    }
  }
}
```

代码直接 `objectMapper.readValue(metrics_summary)` 获得顶层 Map，只有 `{logs, score, result, status}` 四个 key，自然找不到 `latency_ms_mean`。

### 修复方案
1. **ReportGeneratorService.java**: 添加 `flattenMetrics()` 辅助方法，导航到 `result.eval_result.results[0]` 和 `summary`，将嵌套字段展平
2. **ScoringService.java**: 添加 `findMetricsNode()` 辅助方法，返回包含实际 metrics 的 JsonNode
3. **ChipReportController.java**: 添加 `/chip-reports/regenerate/{planId}` 接口
4. 所有读取点兼容多种字段名变体

### 验证结果
报告重新生成后：
- MatMul: latencyMean 2.29ms, P95 3.14ms, throughput 436.5 (之前全是 0.0)
- Conv2D: latencyMean 0.36ms, throughput 2758.9
- MLP-Small: latencyMean 0.05ms, throughput 19705.1
- 全部 9 个算子的延迟和吞吐数据均正确显示 ✓

### 遗留问题
- score 字段全是 50.0：这是因为旧的评测结果入库时 scoring 就有 bug（同样找不到嵌套 metrics），现在 scoring 代码已修复，新跑的评测任务 score 会正确
- 如需修复旧数据的 score，需要写一次性脚本重新计算
