package com.lab.chipreport;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.dimension.DimensionRegistry;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.scoring.ScoringService;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 报告数据组装服务
 * 从 ReportGeneratorService 拆分而来 (#543)
 * 负责：算子排行、瓶颈分析、场景推荐、分类摘要
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportDataAssembler {

    private final ObjectMapper objectMapper;
    private final ScoringService scoringService;
    private final EvaluationResultRepository resultRepository;
    private final EvaluationTaskRepository taskRepository;

    /**
     * 构建算子排行表
     */
    public List<Map<String, Object>> buildOperatorRanking(Long planId, Long runSpecId) {
        List<EvaluationResult> results = resultRepository.findByPlanId(planId);
        List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);
        Map<Long, EvaluationTask> taskMap = tasks.stream()
                .collect(Collectors.toMap(EvaluationTask::getId, t -> t));

        List<Map<String, Object>> ranking = new ArrayList<>();
        for (EvaluationResult r : results) {
            if (r.getMetricsSummary() == null) continue;
            try {
                Map<String, Object> metrics = objectMapper.readValue(
                        r.getMetricsSummary(), new TypeReference<>() {});
                EvaluationTask task = taskMap.get(r.getTaskId());
                String name = task != null ? task.getTestItem() : "unknown";
                if (name == null) name = task != null ? task.getName() : "unknown";

                Map<String, Object> flatMetrics = flattenMetrics(metrics);

                double avgLatency = toDouble(flatMetrics.getOrDefault("latency_ms_mean",
                        flatMetrics.getOrDefault("latency_mean",
                        flatMetrics.getOrDefault("latencyMean",
                        flatMetrics.getOrDefault("latency_ms_p50", 0)))));
                double p95Latency = toDouble(flatMetrics.getOrDefault("latency_ms_p95",
                        flatMetrics.getOrDefault("latency_p95",
                        flatMetrics.getOrDefault("latencyP95", 0))));
                double p99Latency = toDouble(flatMetrics.getOrDefault("latency_ms_p99",
                        flatMetrics.getOrDefault("latency_p99",
                        flatMetrics.getOrDefault("latencyP99", 0))));
                double throughput = toDouble(flatMetrics.getOrDefault("throughput_ops",
                        flatMetrics.getOrDefault("throughput_qps",
                        flatMetrics.getOrDefault("throughput",
                        flatMetrics.getOrDefault("throughput_fps", 0)))));

                double score;
                String dataStatus;
                if (avgLatency > 0 && throughput > 0) {
                    score = scoringService.scoreFromMetrics(r.getMetricsSummary(), name, runSpecId);
                    dataStatus = "VALID";
                } else if (r.getPassed() != null && r.getPassed()) {
                    score = -1;
                    dataStatus = "NO_DATA";
                } else if (r.getErrorMessage() != null && !r.getErrorMessage().isEmpty()) {
                    score = 0;
                    dataStatus = "FAILED";
                } else {
                    score = -1;
                    dataStatus = "NO_DATA";
                }

                String dimension = categorizeToDimension(task);

                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("testItem", name);
                entry.put("dimension", dimension);
                entry.put("latencyMean", Math.round(avgLatency * 100.0) / 100.0);
                entry.put("latencyP95", Math.round(p95Latency * 100.0) / 100.0);
                entry.put("latencyP99", Math.round(p99Latency * 100.0) / 100.0);
                entry.put("throughput", Math.round(throughput * 100.0) / 100.0);
                boolean noBaseline = score < 0 && "VALID".equals(dataStatus);
                entry.put("score", (dataStatus.equals("NO_DATA") || score < 0)
                        ? null : Math.round(score * 10.0) / 10.0);
                entry.put("passed", dataStatus.equals("VALID") && score >= 80.0);
                entry.put("dataStatus", dataStatus);
                if (noBaseline) {
                    entry.put("noBaseline", true);
                    entry.put("noBaselineNote", "无同规格基准数据");
                }
                if (task != null && task.getFailureType() != null) {
                    entry.put("failureType", task.getFailureType().name());
                }

                if ("VALID".equals(dataStatus) && avgLatency > 0) {
                    Double baselineLat = scoringService.getBaselineLatency(name, runSpecId);
                    if (baselineLat != null && baselineLat > 0) {
                        entry.put("baselineLatency", Math.round(baselineLat * 100.0) / 100.0);
                        entry.put("ratio", Math.round((baselineLat / avgLatency) * 1000.0) / 1000.0);
                    }
                }
                ranking.add(entry);
            } catch (Exception e) {
                log.warn("Failed to parse metrics for result {}", r.getId());
            }
        }

        // Include tasks with no result at all
        Set<Long> taskIdsWithResults = results.stream()
                .map(EvaluationResult::getTaskId).collect(Collectors.toSet());
        for (EvaluationTask task : tasks) {
            if (taskIdsWithResults.contains(task.getId())) continue;
            if (!EvaluationTask.TaskStatus.FAILED.equals(task.getStatus())
                    && !EvaluationTask.TaskStatus.CANCELLED.equals(task.getStatus())
                    && !EvaluationTask.TaskStatus.SKIPPED.equals(task.getStatus())) continue;
            String name = task.getTestItem() != null ? task.getTestItem() : task.getName();
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("testItem", name != null ? name : "unknown");
            entry.put("dimension", categorizeToDimension(task));
            entry.put("latencyMean", 0.0);
            entry.put("latencyP95", 0.0);
            entry.put("latencyP99", 0.0);
            entry.put("throughput", 0.0);
            entry.put("score", null);
            entry.put("passed", false);
            entry.put("dataStatus", "NO_DATA");
            if (task.getFailureType() != null) {
                entry.put("failureType", task.getFailureType().name());
            }
            ranking.add(entry);
        }

        ranking.sort((a, b) -> Double.compare(toDouble(b.get("score")), toDouble(a.get("score"))));
        for (int i = 0; i < ranking.size(); i++) {
            ranking.get(i).put("rank", i + 1);
        }
        return ranking;
    }

    /**
     * 构建瓶颈分析
     */
    public List<Map<String, Object>> buildBottleneckAnalysis(
            Map<String, Double> dimScores, List<Map<String, Object>> operatorRanking) {
        List<Map<String, Object>> analysis = new ArrayList<>();

        // 1. Worst performing operators (#470: skip score >= 85)
        List<Map<String, Object>> sorted = operatorRanking.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus")))
                .filter(op -> toDouble(op.get("score")) < 85.0)
                .sorted((a, b) -> Double.compare(toDouble(a.get("score")), toDouble(b.get("score"))))
                .collect(Collectors.toList());
        int worstCount = Math.min(3, sorted.size());
        for (int i = 0; i < worstCount; i++) {
            Map<String, Object> op = sorted.get(i);
            double score = toDouble(op.get("score"));
            String level = score < 50 ? "error" : score < 70 ? "warning" : "info";
            String label = score < 70 ? "低性能算子" : "中等性能算子";

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "worst_operator");
            item.put("level", level);
            item.put("title", label + ": " + op.getOrDefault("name",
                    op.getOrDefault("testItem", "Unknown")));
            item.put("detail", String.format("评分 %.1f，延迟 %.2fms，吞吐 %.1f ops/s",
                    score,
                    toDouble(op.getOrDefault("avgLatency", op.getOrDefault("latencyMean", 0))),
                    toDouble(op.getOrDefault("throughput", 0))));
            item.put("score", Math.round(score * 10.0) / 10.0);
            item.put("operator", op.getOrDefault("name", op.getOrDefault("testItem", "Unknown")));
            analysis.add(item);
        }

        // 2. Most volatile operator (P95/Mean ratio)
        Map<String, Object> mostVolatile = null;
        double maxRatio = 0;
        for (Map<String, Object> op : operatorRanking) {
            double mean = toDouble(op.getOrDefault("avgLatency", op.getOrDefault("latencyMean", 0)));
            double p95 = toDouble(op.getOrDefault("p95Latency", op.getOrDefault("latencyP95", 0)));
            if (mean > 0 && p95 > 0) {
                double ratio = p95 / mean;
                if (ratio > maxRatio) {
                    maxRatio = ratio;
                    mostVolatile = op;
                }
            }
        }
        if (mostVolatile != null && maxRatio > 1.5) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "high_volatility");
            item.put("level", maxRatio > 3 ? "error" : maxRatio > 2 ? "warning" : "info");
            item.put("title", "高波动算子: " + mostVolatile.getOrDefault("name",
                    mostVolatile.getOrDefault("testItem", "Unknown")));
            item.put("detail", String.format("P95/Mean 比值 %.1fx，延迟波动较大，可能影响生产稳定性", maxRatio));
            item.put("ratio", Math.round(maxRatio * 10.0) / 10.0);
            analysis.add(item);
        }

        // 3. Weak dimension warnings
        for (Map.Entry<String, Double> entry : dimScores.entrySet()) {
            if (entry.getValue() > 0 && entry.getValue() < 60) {
                String dimName = DimensionRegistry.getLabelByKey(entry.getKey());
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("type", "weak_dimension");
                item.put("level", entry.getValue() < 40 ? "error" : "warning");
                item.put("title", "薄弱维度: " + dimName);
                item.put("detail", String.format("%s 维度评分仅 %.1f，建议针对性优化",
                        dimName, entry.getValue()));
                item.put("score", Math.round(entry.getValue() * 10.0) / 10.0);
                analysis.add(item);
            }
        }

        // 4. Training/inference imbalance
        double trainScore = dimScores.getOrDefault("training", 0.0);
        double infScore = dimScores.getOrDefault("inference", 0.0);
        if (trainScore > 0 && infScore > 0 && Math.abs(trainScore - infScore) > 30) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "imbalance");
            item.put("level", "warning");
            String stronger = trainScore > infScore ? "训练" : "推理";
            String weaker = trainScore > infScore ? "推理" : "训练";
            item.put("title", "训练/推理不平衡");
            item.put("detail", String.format(
                    "%s(%.1f%%) 显著强于 %s(%.1f%%)，差距 %.1f%%。适合专注 %s 场景，%s 场景慎用。",
                    stronger, Math.max(trainScore, infScore),
                    weaker, Math.min(trainScore, infScore),
                    Math.abs(trainScore - infScore), stronger, weaker));
            analysis.add(item);
        }

        // 5. Memory bandwidth bottleneck
        double memScore = dimScores.getOrDefault("memory", 0.0);
        if (memScore > 0 && memScore < 80 && infScore > 0 && infScore < 90) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "memory_bottleneck");
            item.put("level", memScore < 60 ? "error" : "warning");
            item.put("title", "显存带宽可能是瓶颈");
            item.put("detail", String.format(
                    "访存性能 %.1f%%，推理性能 %.1f%%。建议检查显存带宽利用率，考虑量化或算子融合优化。",
                    memScore, infScore));
            analysis.add(item);
        }

        // 6. Communication bottleneck
        double commScore = dimScores.getOrDefault("communication", 0.0);
        double scaleScore = dimScores.getOrDefault("scalability", 0.0);
        if ((commScore > 0 && commScore < 50) || (scaleScore > 0 && scaleScore < 50)) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "comm_bottleneck");
            item.put("level", "warning");
            item.put("title", "分布式训练风险");
            item.put("detail", String.format(
                    "通信评分 %.1f%%，扩展性 %.1f%%。多卡/多机分布式训练可能出现严重通信瓶颈，建议先单卡验证再扩展。",
                    commScore, scaleScore));
            analysis.add(item);
        }

        // 7. Operator pass rate
        long totalValid = operatorRanking.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus"))).count();
        long totalPassed = operatorRanking.stream()
                .filter(op -> Boolean.TRUE.equals(op.get("passed"))).count();
        if (totalValid > 0) {
            double passRate = (double) totalPassed / totalValid * 100;
            if (passRate < 90) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("type", "low_pass_rate");
                item.put("level", passRate < 70 ? "error" : "warning");
                item.put("title", String.format("算子通过率偏低: %.0f%%", passRate));
                item.put("detail", String.format(
                        "%d/%d 算子通过基准测试。未通过算子可能影响模型兼容性和部署可靠性。",
                        totalPassed, totalValid));
                analysis.add(item);
            }
        }

        // 8. Ecosystem gap
        double ecoScore = dimScores.getOrDefault("ecosystem", 0.0);
        if (ecoScore > 0 && ecoScore < 70) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "ecosystem_gap");
            item.put("level", "warning");
            item.put("title", "生态支持不足");
            item.put("detail", String.format(
                    "生态评分 %.1f%%。支持的精度类型较少或软件栈不完善，可能影响模型适配和开发效率。",
                    ecoScore));
            analysis.add(item);
        }

        // 9. Efficiency concern
        double overallAvg = dimScores.values().stream()
                .filter(v -> v > 0).mapToDouble(Double::doubleValue).average().orElse(0);
        if (overallAvg < 80 && overallAvg > 0) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "efficiency_concern");
            item.put("level", "info");
            item.put("title", "综合性价比待评估");
            item.put("detail", String.format(
                    "有效维度均分 %.1f%%，未达到 L40S 80%% 水平。建议结合价格和功耗评估 TCO。",
                    overallAvg));
            analysis.add(item);
        }

        // 10. Single strength
        List<Map.Entry<String, Double>> highDims = dimScores.entrySet().stream()
                .filter(e -> e.getValue() >= 120).collect(Collectors.toList());
        if (highDims.size() >= 1 && highDims.size() <= 2) {
            String dims = highDims.stream()
                    .map(e -> DimensionRegistry.getLabelByKey(e.getKey())
                            + "(" + String.format("%.0f%%", e.getValue()) + ")")
                    .collect(Collectors.joining("、"));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "single_strength");
            item.put("level", "info");
            item.put("title", "突出优势: " + dims);
            item.put("detail", "这些维度显著超越 L40S，可作为芯片核心卖点和差异化竞争优势。");
            analysis.add(item);
        }

        return analysis;
    }

    /**
     * 构建场景推荐
     */
    public List<Map<String, Object>> buildScenarioRecommendations(
            Map<String, Double> dimScores, double overallScore) {
        List<Map<String, Object>> recommendations = new ArrayList<>();

        double computeScore = dimScores.getOrDefault("compute", 0.0);
        double memoryScore = dimScores.getOrDefault("memory", 0.0);
        double opCompatScore = dimScores.getOrDefault("op_compat", 0.0);
        double inferenceScore = dimScores.getOrDefault("inference", 0.0);

        // Recommended
        if (overallScore >= 75 && computeScore >= 85)
            addRec(recommendations, "recommended", "大规模矩阵运算",
                    String.format("计算性能突出（%.1f分），适合 HPC、科学计算等计算密集型场景", computeScore),
                    Arrays.asList("计算性能"));
        if (overallScore >= 75 && inferenceScore >= 85) {
            addRec(recommendations, "recommended", "大语言模型推理",
                    String.format("Attention 能力优秀（%.1f分），适合 LLM 推理和 Transformer 模型部署", inferenceScore),
                    Arrays.asList("Attention能力"));
            addRec(recommendations, "recommended", "模型部署服务",
                    String.format("模型推理性能优秀（%.1f分），适合生产环境模型部署", inferenceScore),
                    Arrays.asList("模型推理"));
        }
        if (overallScore >= 75 && opCompatScore >= 85)
            addRec(recommendations, "recommended", "训练加速",
                    String.format("数学函数性能优秀（%.1f分），激活函数高效，适合模型训练", opCompatScore),
                    Arrays.asList("数学函数"));
        if (overallScore >= 75 && memoryScore >= 85)
            addRec(recommendations, "recommended", "大批量数据处理",
                    String.format("访存性能优秀（%.1f分），适合大规模数据预处理和 embedding 查询", memoryScore),
                    Arrays.asList("访存性能"));

        // Caution
        if (inferenceScore >= 60 && inferenceScore < 75)
            addRec(recommendations, "caution", "Transformer 模型",
                    String.format("Attention 能力中等（%.1f分），部署 Transformer 模型时需关注延迟", inferenceScore),
                    Arrays.asList("Attention能力"));
        if (computeScore >= 60 && computeScore < 75)
            addRec(recommendations, "caution", "计算密集型任务",
                    String.format("计算性能中等（%.1f分），大规模矩阵运算可能成为瓶颈", computeScore),
                    Arrays.asList("计算性能"));
        if (memoryScore >= 60 && memoryScore < 75)
            addRec(recommendations, "caution", "内存密集型任务",
                    String.format("访存性能中等（%.1f分），大批量 embedding 和转置操作需关注", memoryScore),
                    Arrays.asList("访存性能"));
        if (opCompatScore >= 60 && opCompatScore < 75)
            addRec(recommendations, "caution", "深层网络训练",
                    String.format("归一化性能中等（%.1f分），深层网络 LayerNorm/BatchNorm 性能需关注", opCompatScore),
                    Arrays.asList("归一化性能"));

        // Unverified
        if (inferenceScore < 60) {
            addRec(recommendations, "unverified", "大语言模型",
                    inferenceScore > 0
                            ? String.format("Attention 维度评分较低（%.1f分），LLM 部署前需充分验证", inferenceScore)
                            : "缺少 Attention 维度评测数据，LLM 部署前需补充验证",
                    Arrays.asList("Attention能力"));
            addRec(recommendations, "unverified", "端到端模型推理",
                    inferenceScore > 0
                            ? String.format("模型推理评分较低（%.1f分），生产部署前需验证", inferenceScore)
                            : "缺少模型推理评测数据，部署前需补充验证",
                    Arrays.asList("模型推理"));
        }
        if (computeScore < 60)
            addRec(recommendations, "unverified", "高性能计算",
                    computeScore > 0
                            ? String.format("计算性能评分较低（%.1f分），HPC 场景需充分验证", computeScore)
                            : "缺少计算性能评测数据，HPC 场景需补充验证",
                    Arrays.asList("计算性能"));

        return recommendations;
    }

    /**
     * 构建分类摘要（训练/推理）
     */
    public Map<String, Object> buildCategorySummary(
            List<Map<String, Object>> operatorRanking, String dimension, double dimensionScore) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("dimension", dimension);
        summary.put("overallScore", Math.round(dimensionScore * 10.0) / 10.0);

        List<Map<String, Object>> operators = operatorRanking.stream()
                .filter(op -> dimension.equals(op.get("dimension")))
                .collect(Collectors.toList());

        summary.put("operatorCount", operators.size());
        summary.put("validCount", operators.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus"))).count());

        operators.stream()
                .filter(op -> op.get("score") != null)
                .max((a, b) -> Double.compare(toDouble(a.get("score")), toDouble(b.get("score"))))
                .ifPresent(best -> {
                    summary.put("bestOperator", best.get("testItem"));
                    summary.put("bestScore", toDouble(best.get("score")));
                });

        operators.stream()
                .filter(op -> op.get("score") != null && toDouble(op.get("score")) > 0)
                .min((a, b) -> Double.compare(toDouble(a.get("score")), toDouble(b.get("score"))))
                .ifPresent(worst -> {
                    String worstName = (String) worst.get("testItem");
                    Object bestName = summary.get("bestOperator");
                    if (bestName == null || !bestName.equals(worstName)) {
                        summary.put("worstOperator", worstName);
                        summary.put("worstScore", toDouble(worst.get("score")));
                    }
                });

        double avgLatency = operators.stream()
                .filter(op -> toDouble(op.getOrDefault("latencyMean", 0)) > 0)
                .mapToDouble(op -> toDouble(op.get("latencyMean")))
                .average().orElse(0);
        double avgThroughput = operators.stream()
                .filter(op -> toDouble(op.getOrDefault("throughput", 0)) > 0)
                .mapToDouble(op -> toDouble(op.get("throughput")))
                .average().orElse(0);

        summary.put("avgLatencyMs", Math.round(avgLatency * 1000.0) / 1000.0);
        summary.put("avgThroughput", Math.round(avgThroughput * 10.0) / 10.0);

        return summary;
    }

    // -- Utility methods --

    @SuppressWarnings("unchecked")
    public Map<String, Object> flattenMetrics(Map<String, Object> metrics) {
        Map<String, Object> flat = new LinkedHashMap<>(metrics);
        try {
            Object resultObj = metrics.get("result");
            if (resultObj instanceof Map) {
                Map<String, Object> result = (Map<String, Object>) resultObj;
                Object evalResult = result.get("eval_result");
                if (evalResult instanceof Map) {
                    Map<String, Object> eval = (Map<String, Object>) evalResult;
                    Object summary = eval.get("summary");
                    if (summary instanceof Map) flat.putAll((Map<String, Object>) summary);
                    Object results = eval.get("results");
                    if (results instanceof List) {
                        List<Object> resultList = (List<Object>) results;
                        if (resultList.size() == 1 && resultList.get(0) instanceof Map) {
                            ((Map<String, Object>) resultList.get(0)).forEach(flat::putIfAbsent);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Failed to flatten metrics: {}", e.getMessage());
        }
        return flat;
    }

    public String categorizeToDimension(EvaluationTask task) {
        if (task == null) return "compute";
        return DimensionRegistry.getKeyByOperator(task.getTestItem());
    }

    private void addRec(List<Map<String, Object>> list, String type,
                        String scenario, String reason, List<String> dimensions) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("type", type);
        item.put("scenario", scenario);
        item.put("reason", reason);
        item.put("dimensions", dimensions);
        list.add(item);
    }

    double toDouble(Object val) {
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0; }
    }
}
