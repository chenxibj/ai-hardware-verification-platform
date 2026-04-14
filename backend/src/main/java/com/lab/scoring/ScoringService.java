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

    /** Cached baseline latency map: testItem -> latency_ms_mean */
    private volatile Map<String, Double> baselineLatencyCache = null;

    // 维度映射：testItem -> dimension（#435: 扩展为 8 维）
    private static final Map<String, String> DIMENSION_MAP = new LinkedHashMap<>();
    static {
        // 计算
        DIMENSION_MAP.put("MatMul", "计算");
        DIMENSION_MAP.put("Conv2D", "计算");
        DIMENSION_MAP.put("GEMM", "计算");
        DIMENSION_MAP.put("Linear", "计算");
        // 访存
        DIMENSION_MAP.put("Transpose", "访存");
        DIMENSION_MAP.put("Embedding", "访存");
        DIMENSION_MAP.put("Concat", "访存");
        DIMENSION_MAP.put("Gather", "访存");
        DIMENSION_MAP.put("Scatter", "访存");
        DIMENSION_MAP.put("Memcpy", "访存");
        DIMENSION_MAP.put("Bandwidth", "访存");
        // 通信
        DIMENSION_MAP.put("AllReduce", "通信");
        DIMENSION_MAP.put("AllGather", "通信");
        DIMENSION_MAP.put("NCCL", "通信");
        DIMENSION_MAP.put("P2P", "通信");
        DIMENSION_MAP.put("Broadcast", "通信");
        DIMENSION_MAP.put("ReduceScatter", "通信");
        // 算子兼容
        DIMENSION_MAP.put("ReLU", "算子兼容");
        DIMENSION_MAP.put("GELU", "算子兼容");
        DIMENSION_MAP.put("SiLU", "算子兼容");
        DIMENSION_MAP.put("Sigmoid", "算子兼容");
        DIMENSION_MAP.put("Tanh", "算子兼容");
        DIMENSION_MAP.put("Softmax", "算子兼容");
        DIMENSION_MAP.put("LayerNorm", "算子兼容");
        DIMENSION_MAP.put("BatchNorm", "算子兼容");
        DIMENSION_MAP.put("RMSNorm", "算子兼容");
        DIMENSION_MAP.put("Add", "算子兼容");
        DIMENSION_MAP.put("Mul", "算子兼容");
        // 训练
        DIMENSION_MAP.put("Backward", "训练");
        DIMENSION_MAP.put("Gradient", "训练");
        DIMENSION_MAP.put("Optimizer", "训练");
        DIMENSION_MAP.put("Adam", "训练");
        DIMENSION_MAP.put("SGD", "训练");
        DIMENSION_MAP.put("MixedPrecision", "训练");
        // 推理
        DIMENSION_MAP.put("Attention", "推理");
        DIMENSION_MAP.put("ScaledDotProduct", "推理");
        DIMENSION_MAP.put("MLP", "推理");
        DIMENSION_MAP.put("MLP-Small", "推理");
        DIMENSION_MAP.put("MLP-Medium", "推理");
        DIMENSION_MAP.put("MLP-Large", "推理");
        DIMENSION_MAP.put("ResNet", "推理");
        DIMENSION_MAP.put("BERT", "推理");
        DIMENSION_MAP.put("LLaMA", "推理");
        // 扩展性 和 生态 是非算子维度，基于芯片属性计算
    }

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
                    if (r.getPassed() == null || !r.getPassed()) continue;
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
                    return root.get("score").asDouble();
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
                    return (baselineLatency / chipLatency) * 100.0;
                }
                // Try prefix match for test items like "MLP-Medium/batch=4"
                for (Map.Entry<String, Double> entry : baseline.entrySet()) {
                    if (testItem.startsWith(entry.getKey()) && entry.getValue() > 0) {
                        return (entry.getValue() / chipLatency) * 100.0;
                    }
                }
            }

            // Fallback to old scoring if no baseline found
            return scoreLatency(chipLatency);
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

        return results.stream()
                .filter(r -> r.getPassed() != null && r.getPassed())
                .mapToDouble(r -> {
                    EvaluationTask task = taskMap.get(r.getTaskId());
                    String testItem = task != null ? task.getTestItem() : null;
                    return scoreFromMetrics(r.getMetricsSummary(), testItem);
                })
                .average().orElse(0);
    }

    /**
     * 兼容旧调用
     */
    public double calculateOverallScore(List<EvaluationResult> results) {
        return results.stream()
                .filter(r -> r.getPassed() != null && r.getPassed())
                .mapToDouble(r -> scoreFromMetrics(r.getMetricsSummary()))
                .average().orElse(0);
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

            String dimension = DIMENSION_MAP.getOrDefault(task.getTestItem(), "其他");
            double score = scoreFromMetrics(result.getMetricsSummary(), task.getTestItem());
            dimScores.computeIfAbsent(dimension, k -> new ArrayList<>()).add(score);
        }

        Map<String, Double> averaged = new LinkedHashMap<>();
        for (Map.Entry<String, List<Double>> entry : dimScores.entrySet()) {
            averaged.put(entry.getKey(),
                    entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0));
        }
        return averaged;
    }

    /**
     * 获取 testItem 对应的维度名称
     */
    public String getDimension(String testItem) {
        if (testItem == null) return "其他";
        String dim = DIMENSION_MAP.get(testItem);
        if (dim != null) return dim;
        for (Map.Entry<String, String> entry : DIMENSION_MAP.entrySet()) {
            if (testItem.startsWith(entry.getKey())) return entry.getValue();
        }
        String lower = testItem.toLowerCase();
        if (lower.contains("mlp") || lower.contains("resnet") || lower.contains("bert") || lower.contains("llama") || lower.contains("model") || lower.contains("inference")) {
            return "推理";
        }
        if (lower.contains("allreduce") || lower.contains("nccl") || lower.contains("p2p") || lower.contains("broadcast")) {
            return "通信";
        }
        if (lower.contains("backward") || lower.contains("gradient") || lower.contains("optimizer") || lower.contains("train")) {
            return "训练";
        }
        return "其他";
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
            item.put("dimension", testItem != null ? getDimension(testItem) : "其他");
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
