package com.lab.scoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.result.EvaluationResult;
import com.lab.task.EvaluationTask;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 评分计算服务
 * Issue: #135, #139 (六维度增强)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ScoringService {

    private final ObjectMapper objectMapper;

    // 维度映射：testItem -> dimension（扩展为 6 维）
    private static final Map<String, String> DIMENSION_MAP = new LinkedHashMap<>();
    static {
        // 计算性能
        DIMENSION_MAP.put("MatMul", "计算性能");
        DIMENSION_MAP.put("Conv2D", "计算性能");
        DIMENSION_MAP.put("GEMM", "计算性能");
        DIMENSION_MAP.put("Linear", "计算性能");
        // 访存性能
        DIMENSION_MAP.put("Transpose", "访存性能");
        DIMENSION_MAP.put("Embedding", "访存性能");
        DIMENSION_MAP.put("Concat", "访存性能");
        DIMENSION_MAP.put("Gather", "访存性能");
        DIMENSION_MAP.put("Scatter", "访存性能");
        // 数学函数
        DIMENSION_MAP.put("ReLU", "数学函数");
        DIMENSION_MAP.put("GELU", "数学函数");
        DIMENSION_MAP.put("SiLU", "数学函数");
        DIMENSION_MAP.put("Sigmoid", "数学函数");
        DIMENSION_MAP.put("Tanh", "数学函数");
        DIMENSION_MAP.put("Softmax", "数学函数");
        // Attention
        DIMENSION_MAP.put("Attention", "Attention能力");
        DIMENSION_MAP.put("ScaledDotProduct", "Attention能力");
        // 归一化
        DIMENSION_MAP.put("LayerNorm", "归一化性能");
        DIMENSION_MAP.put("BatchNorm", "归一化性能");
        DIMENSION_MAP.put("RMSNorm", "归一化性能");
        // 模型推理
        DIMENSION_MAP.put("MLP", "模型推理");
        DIMENSION_MAP.put("MLP-Small", "模型推理");
        DIMENSION_MAP.put("MLP-Medium", "模型推理");
        DIMENSION_MAP.put("MLP-Large", "模型推理");
        DIMENSION_MAP.put("ResNet", "模型推理");
        DIMENSION_MAP.put("BERT", "模型推理");
    }

    /**
     * 基于延迟计算单个任务评分（0-100）
     */
    public double scoreLatency(double latencyMs) {
        if (latencyMs <= 0) return 0;
        double score = 100 - 20 * Math.log10(latencyMs);
        return Math.max(0, Math.min(100, score));
    }

    /**
     * 从 metricsSummary JSON 中提取延迟并计算评分
     */
    public double scoreFromMetrics(String metricsSummary) {
        if (metricsSummary == null || metricsSummary.isEmpty()) return 0;
        try {
            JsonNode node = objectMapper.readTree(metricsSummary);
            if (node.has("latencyMean") && !node.get("latencyMean").isNull()) {
                return scoreLatency(node.get("latencyMean").asDouble());
            }
            if (node.has("latencyP50") && !node.get("latencyP50").isNull()) {
                return scoreLatency(node.get("latencyP50").asDouble());
            }
            return 0;
        } catch (Exception e) {
            log.warn("Failed to parse metricsSummary: {}", e.getMessage());
            return 0;
        }
    }

    /**
     * 计算综合评分（仅计算通过的任务的平均分）
     */
    public double calculateOverallScore(List<EvaluationResult> results) {
        return results.stream()
                .filter(r -> r.getPassed() != null && r.getPassed())
                .mapToDouble(r -> scoreFromMetrics(r.getMetricsSummary()))
                .average().orElse(0);
    }

    /**
     * 按维度分组计算评分
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
            double score = scoreFromMetrics(result.getMetricsSummary());
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
        return DIMENSION_MAP.getOrDefault(testItem, "其他");
    }

    /**
     * 生成算子排行（按评分降序）
     */
    public String generateOperatorRanking(
            List<EvaluationResult> results, List<EvaluationTask> tasks) {
        Map<Long, EvaluationTask> taskMap = tasks.stream()
                .collect(Collectors.toMap(EvaluationTask::getId, t -> t));

        List<Map<String, Object>> ranking = new ArrayList<>();
        for (EvaluationResult result : results) {
            EvaluationTask task = taskMap.get(result.getTaskId());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("taskId", result.getTaskId());
            item.put("testItem", task != null ? task.getTestItem() : "Unknown");
            item.put("dimension", task != null ? getDimension(task.getTestItem()) : "其他");
            item.put("passed", result.getPassed() != null && result.getPassed());
            item.put("score", scoreFromMetrics(result.getMetricsSummary()));

            try {
                if (result.getMetricsSummary() != null) {
                    JsonNode metrics = objectMapper.readTree(result.getMetricsSummary());
                    item.put("latencyMean", metrics.has("latencyMean") ? metrics.get("latencyMean").asDouble() : null);
                    item.put("throughput", metrics.has("throughput") ? metrics.get("throughput").asDouble() : null);
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
