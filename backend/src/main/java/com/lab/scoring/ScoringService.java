package com.lab.scoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

import com.lab.dimension.DimensionRegistry;

/**
 * 评分计算服务
 * Issue: #135, #139 (六维度增强), #434 (vs L40S 百分比)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ScoringService {

    private final ObjectMapper objectMapper;
    private final ChipRepository chipRepository;
    private final EvaluationResultRepository resultRepository;
    private final EvaluationTaskRepository taskRepository;
    private final EvaluationPlanRepository planRepository;

    /** #525: Maximum allowed score percentage to prevent extreme outliers */
    private static final double MAX_SCORE_PERCENT = 200.0;

    /** #527: Round to 2 decimal places to avoid floating point precision tails */
    private static double roundTo2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    /** Cached baseline latency map: testItem -> latency_ms_mean */
    private volatile Map<String, Double> baselineLatencyCache = null;

    

    /**
     * Navigate nested JSON to find actual metrics data.
     */
    private JsonNode findMetricsNode(JsonNode root) {
        if (root.has("latency_ms_mean") || root.has("latency_mean") || root.has("latencyMean") || root.has("avg_latency_ms")) {
            return root;
        }
        JsonNode result = root.path("result");
        if (!result.isMissingNode()) {
            JsonNode evalResult = result.path("eval_result");
            if (!evalResult.isMissingNode()) {
                JsonNode results = evalResult.path("results");
                if (results.isArray() && results.size() > 0) {
                    JsonNode first = results.get(0);
                    if (first.has("latency_ms_mean") || first.has("latency_mean")) {
                        return first;
                    }
                }
                JsonNode summary = evalResult.path("summary");
                if (!summary.isMissingNode() && (summary.has("avg_latency_ms") || summary.has("latency_ms_mean"))) {
                    return summary;
                }
            }
        }
        return root;
    }

    /**
     * Extract latency from a metrics JSON node.
     */
    private double extractLatency(JsonNode node) {
        String latKey = node.has("latency_ms_mean") ? "latency_ms_mean"
                : node.has("latency_mean") ? "latency_mean"
                : node.has("latencyMean") ? "latencyMean"
                : node.has("avg_latency_ms") ? "avg_latency_ms" : null;
        if (latKey != null && !node.get(latKey).isNull()) {
            return node.get(latKey).asDouble();
        }
        if (node.has("latencyP50") && !node.get("latencyP50").isNull()) {
            return node.get("latencyP50").asDouble();
        }
        return -1;
    }

    /**
     * Load L40S baseline latency data (cached).
     * Returns map: testItem -> average latency_ms_mean
     */
    private Map<String, Double> getBaselineLatencyMap() {
        if (baselineLatencyCache != null) return baselineLatencyCache;

        Map<String, Double> baseline = new HashMap<>();
        try {
            List<Chip> l40sChips = chipRepository.findByNameContainingIgnoreCase("L40S");
            if (l40sChips.isEmpty()) {
                log.warn("#434: No L40S baseline chip found");
                baselineLatencyCache = baseline;
                return baseline;
            }

            // Collect all L40S chip IDs
            Set<Long> l40sChipIds = l40sChips.stream().map(Chip::getId).collect(Collectors.toSet());

            // Get all plans for L40S chips
            List<Long> planIds = new ArrayList<>();
            for (Long chipId : l40sChipIds) {
                planRepository.findByChipId(chipId).forEach(p -> planIds.add(p.getId()));
            }

            if (planIds.isEmpty()) {
                log.warn("#434: No evaluation plans found for L40S chips");
                baselineLatencyCache = baseline;
                return baseline;
            }

            // Build testItem -> latencies map from all L40S plans
            Map<String, List<Double>> latencies = new HashMap<>();
            for (Long planId : planIds) {
                List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);
                List<EvaluationResult> results = resultRepository.findByPlanId(planId);
                Map<Long, String> taskItemMap = tasks.stream()
                        .filter(t -> t.getTestItem() != null)
                        .collect(Collectors.toMap(EvaluationTask::getId, EvaluationTask::getTestItem));

                for (EvaluationResult r : results) {
                    // #525: Accept results with valid metrics regardless of passed/data_status
                    // Old data may have passed=false or data_status=NULL but still contain
                    // valid latency measurements. Only skip explicit FAILED status.
                    if ("FAILED".equals(r.getDataStatus())) continue;
                    String testItem = taskItemMap.get(r.getTaskId());
                    if (testItem == null || r.getMetricsSummary() == null) continue;

                    try {
                        JsonNode root = objectMapper.readTree(r.getMetricsSummary());
                        JsonNode node = findMetricsNode(root);
                        double lat = extractLatency(node);
                        if (lat > 0) {
                            latencies.computeIfAbsent(testItem, k -> new ArrayList<>()).add(lat);
                        }
                    } catch (Exception e) {
                        log.debug("Failed to parse L40S baseline metrics for {}: {}", testItem, e.getMessage());
                    }
                }
            }

            // Average each test item's latencies
            for (Map.Entry<String, List<Double>> entry : latencies.entrySet()) {
                double avg = entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0);
                if (avg > 0) baseline.put(entry.getKey(), avg);
            }

            log.info("#434: Loaded L40S baseline for {} test items", baseline.size());
        } catch (Exception e) {
            log.error("#434: Failed to load L40S baseline: {}", e.getMessage());
        }

        baselineLatencyCache = baseline;
        return baseline;
    }

    /**
     * Clear baseline cache (useful when new L40S data is added)
     */
    public void clearBaselineCache() {
        baselineLatencyCache = null;
    }

    /**
     * #515: Get baseline latency for a specific test item (for scoring explainability).
     * Returns null if no baseline data exists for this test item.
     */
    public Double getBaselineLatency(String testItem) {
        if (testItem == null) return null;
        Map<String, Double> baseline = getBaselineLatencyMap();
        Double lat = baseline.get(testItem);
        if (lat != null) return lat;
        // Try prefix match
        for (Map.Entry<String, Double> entry : baseline.entrySet()) {
            if (testItem.startsWith(entry.getKey()) && entry.getValue() > 0) {
                return entry.getValue();
            }
        }
        return null;
    }

    /**
     * 基于延迟计算单个任务评分（旧算法 0-100，用作 fallback）
     */
    public double scoreLatency(double latencyMs) {
        if (latencyMs <= 0) return 0;
        double score = 100 - 20 * Math.log10(latencyMs);
        return Math.max(0, Math.min(100, score));
    }

    /**
     * #434: 从 metricsSummary JSON 中提取延迟并计算 vs L40S 百分比
     * 新签名：带 testItem 参数
     */
    public double scoreFromMetrics(String metricsSummary, String testItem) {
        if (metricsSummary == null || metricsSummary.isEmpty()) return 0;
        try {
            JsonNode root = objectMapper.readTree(metricsSummary);
            JsonNode node = findMetricsNode(root);
            double chipLatency = extractLatency(node);

            if (chipLatency <= 0) {
                // Try score field as fallback
                if (root.has("score") && !root.get("score").isNull()) {
                    return roundTo2(Math.min(root.get("score").asDouble(), MAX_SCORE_PERCENT));
                }
                return 0;
            }

            // #434: Try percentage vs L40S baseline
            if (testItem != null) {
                Map<String, Double> baseline = getBaselineLatencyMap();
                Double baselineLatency = baseline.get(testItem);
                if (baselineLatency != null && baselineLatency > 0) {
                    // percentage = (baseline / chip) * 100
                    // If chip is faster (lower latency), percentage > 100%
                    return roundTo2(Math.min((baselineLatency / chipLatency) * 100.0, MAX_SCORE_PERCENT));
                }
                // Try prefix match for test items like "MLP-Medium/batch=4"
                for (Map.Entry<String, Double> entry : baseline.entrySet()) {
                    if (testItem.startsWith(entry.getKey()) && entry.getValue() > 0) {
                        return roundTo2(Math.min((entry.getValue() / chipLatency) * 100.0, MAX_SCORE_PERCENT));
                    }
                }
            }

            // Fallback to old scoring if no baseline found
            return roundTo2(scoreLatency(chipLatency));
        } catch (Exception e) {
            log.warn("Failed to parse metricsSummary: {}", e.getMessage());
            return 0;
        }
    }

    /**
     * 兼容旧调用（无 testItem 参数）
     */
    public double scoreFromMetrics(String metricsSummary) {
        return scoreFromMetrics(metricsSummary, null);
    }

    /**
     * #434: 计算综合评分（需要 tasks 来获取 testItem 做 vs L40S 比较）
     */
    public double calculateOverallScore(List<EvaluationResult> results, List<EvaluationTask> tasks) {
        Map<Long, EvaluationTask> taskMap = tasks.stream()
                .collect(Collectors.toMap(EvaluationTask::getId, t -> t));

        return roundTo2(results.stream()
                .filter(r -> r.getPassed() != null && r.getPassed())
                .mapToDouble(r -> {
                    EvaluationTask task = taskMap.get(r.getTaskId());
                    String testItem = task != null ? task.getTestItem() : null;
                    return scoreFromMetrics(r.getMetricsSummary(), testItem);
                })
                .average().orElse(0));
    }

    /**
     * 兼容旧调用
     */
    public double calculateOverallScore(List<EvaluationResult> results) {
        return roundTo2(results.stream()
                .filter(r -> r.getPassed() != null && r.getPassed())
                .mapToDouble(r -> scoreFromMetrics(r.getMetricsSummary()))
                .average().orElse(0));
    }

    /**
     * 按维度分组计算评分（#434: 返回 vs L40S 百分比）
     */
    public Map<String, Double> calculateDimensionScores(
            List<EvaluationResult> results, List<EvaluationTask> tasks) {

        Map<Long, EvaluationTask> taskMap = tasks.stream()
                .collect(Collectors.toMap(EvaluationTask::getId, t -> t));

        Map<String, List<Double>> dimScores = new LinkedHashMap<>();

        for (EvaluationResult result : results) {
            if (result.getPassed() == null || !result.getPassed()) continue;
            EvaluationTask task = taskMap.get(result.getTaskId());
            if (task == null || task.getTestItem() == null) continue;

            String dimension = DimensionRegistry.getKeyByOperator(task.getTestItem());
            double score = scoreFromMetrics(result.getMetricsSummary(), task.getTestItem());
            dimScores.computeIfAbsent(dimension, k -> new ArrayList<>()).add(score);
        }

        Map<String, Double> averaged = new LinkedHashMap<>();
        for (Map.Entry<String, List<Double>> entry : dimScores.entrySet()) {
            averaged.put(entry.getKey(),
                    roundTo2(entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0)));
        }
        return averaged;
    }

    /**
     * 获取 testItem 对应的维度 key（英文）
     * #459: Delegates to DimensionRegistry
     */
    public String getDimension(String testItem) {
        return DimensionRegistry.getKeyByOperator(testItem);
    }

    /**
     * 生成算子排行（按评分降序）— #434: 评分改为百分比
     */
    public String generateOperatorRanking(
            List<EvaluationResult> results, List<EvaluationTask> tasks) {
        Map<Long, EvaluationTask> taskMap = tasks.stream()
                .collect(Collectors.toMap(EvaluationTask::getId, t -> t));

        List<Map<String, Object>> ranking = new ArrayList<>();
        for (EvaluationResult result : results) {
            EvaluationTask task = taskMap.get(result.getTaskId());
            String testItem = task != null ? task.getTestItem() : null;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("taskId", result.getTaskId());
            item.put("testItem", testItem != null ? testItem : "Unknown");
            item.put("dimension", testItem != null ? getDimension(testItem) : "compute");
            item.put("passed", result.getPassed() != null && result.getPassed());
            item.put("score", scoreFromMetrics(result.getMetricsSummary(), testItem));

            // Determine dataStatus for frontend compatibility (#405)
            String dataStatus;
            if (result.getMetricsSummary() != null && result.getPassed() != null) {
                if (result.getErrorMessage() != null && !result.getErrorMessage().isEmpty()) {
                    dataStatus = "FAILED";
                } else {
                    dataStatus = "VALID";
                }
            } else if (result.getErrorMessage() != null && !result.getErrorMessage().isEmpty()) {
                dataStatus = "FAILED";
            } else {
                dataStatus = "NO_DATA";
            }
            item.put("dataStatus", dataStatus);

            try {
                if (result.getMetricsSummary() != null) {
                    JsonNode metrics = objectMapper.readTree(result.getMetricsSummary());
                    JsonNode metricsNode = findMetricsNode(metrics);
                    double latVal = metricsNode.has("latency_ms_mean") ? metricsNode.get("latency_ms_mean").asDouble() :
                                    metricsNode.has("avg_latency_ms") ? metricsNode.get("avg_latency_ms").asDouble() :
                                    metricsNode.has("latency_mean") ? metricsNode.get("latency_mean").asDouble() :
                                    metricsNode.has("latencyMean") ? metricsNode.get("latencyMean").asDouble() : 0;
                    item.put("latencyMean", latVal > 0 ? latVal : null);
                    double tpVal = metricsNode.has("throughput_qps") ? metricsNode.get("throughput_qps").asDouble() :
                                   metricsNode.has("throughput_ops") ? metricsNode.get("throughput_ops").asDouble() :
                                   metricsNode.has("throughput") ? metricsNode.get("throughput").asDouble() :
                                   metricsNode.has("avg_throughput_qps") ? metricsNode.get("avg_throughput_qps").asDouble() : 0;
                    item.put("throughput", tpVal > 0 ? tpVal : null);
                }
            } catch (Exception e) {
                log.warn("Failed to parse metrics for ranking: {}", e.getMessage());
            }

            ranking.add(item);
        }

        ranking.sort((a, b) -> Double.compare(
                ((Number) b.getOrDefault("score", 0.0)).doubleValue(),
                ((Number) a.getOrDefault("score", 0.0)).doubleValue()));

        try {
            return objectMapper.writeValueAsString(ranking);
        } catch (Exception e) {
            log.error("Failed to serialize operator ranking", e);
            return "[]";
        }
    }
}
