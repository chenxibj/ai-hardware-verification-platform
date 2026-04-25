package com.lab.scoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.chip.ChipRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.runspec.RunSpecRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

import com.lab.dimension.DimensionRegistry;

/**
 * 评分计算服务
 * #543: 拆分后仅保留核心评分逻辑。
 * Baseline 数据 → BaselineDataService, RunSpec 推断 → RunSpecResolver
 */
@Slf4j
@Service
public class ScoringService {

    private final ObjectMapper objectMapper;
    private final BaselineDataService baselineDataService;
    private final RunSpecResolver runSpecResolver;

    /** #525: Maximum allowed score percentage to prevent extreme outliers */
    private static final double MAX_SCORE_PERCENT = 200.0;

    /** #527: Round to 2 decimal places */
    private static double roundTo2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    /**
     * Primary constructor — used by Spring DI.
     */
    public ScoringService(ObjectMapper objectMapper,
                          BaselineDataService baselineDataService,
                          RunSpecResolver runSpecResolver) {
        this.objectMapper = objectMapper;
        this.baselineDataService = baselineDataService;
        this.runSpecResolver = runSpecResolver;
    }

    /**
     * Legacy constructor — used by existing unit tests that construct ScoringService directly.
     * Creates BaselineDataService and RunSpecResolver internally.
     */
    public ScoringService(ObjectMapper objectMapper,
                          ChipRepository chipRepository,
                          EvaluationResultRepository resultRepository,
                          EvaluationTaskRepository taskRepository,
                          EvaluationPlanRepository planRepository,
                          RunSpecRepository runSpecRepository) {
        this.objectMapper = objectMapper;
        this.baselineDataService = new BaselineDataService(
                objectMapper, chipRepository, resultRepository, taskRepository, planRepository);
        this.runSpecResolver = new RunSpecResolver(objectMapper, runSpecRepository);
    }

    // ── Delegation methods (preserve public API) ──────────────────────────

    /** Delegate: load GPU→SpecId mapping (called by tests / diagnostics) */
    public void initGpuCountToSpecIdMapping() {
        runSpecResolver.initGpuCountToSpecIdMapping();
    }

    /** Delegate: infer runSpecId from eval config (called by tests) */
    Long inferRunSpecIdFromEvalConfig(String evalConfig) {
        return runSpecResolver.inferRunSpecIdFromEvalConfig(evalConfig);
    }

    /** Delegate: get baseline latency map */
    public Map<String, Double> getBaselineLatencyMap(Long runSpecId) {
        return baselineDataService.getBaselineLatencyMap(runSpecId);
    }

    /** Delegate: resolve runSpecId for a plan */
    public Long resolveRunSpecId(EvaluationPlan plan) {
        return runSpecResolver.resolveRunSpecId(plan);
    }

    /** Delegate: clear all baseline caches */
    public void clearBaselineCache() {
        baselineDataService.clearBaselineCache();
        runSpecResolver.clearInferredSpecCache();
    }

    /** Delegate: clear cache for a specific runSpec */
    public void clearBaselineCache(Long runSpecId) {
        baselineDataService.clearBaselineCache(runSpecId);
    }

    /** Delegate: get baseline latency for a test item */
    public Double getBaselineLatency(String testItem) {
        return baselineDataService.getBaselineLatency(testItem);
    }

    /** Delegate: get baseline latency for a test item (spec-aware) */
    public Double getBaselineLatency(String testItem, Long runSpecId) {
        return baselineDataService.getBaselineLatency(testItem, runSpecId);
    }

    /** Delegate: get baseline coverage */
    public Map<String, Object> getBaselineCoverage(Long runSpecId) {
        return baselineDataService.getBaselineCoverage(runSpecId);
    }

    /** Delegate: get baseline source info */
    public Map<String, Object> getBaselineSource(Long runSpecId) {
        return baselineDataService.getBaselineSource(runSpecId);
    }

    // ── Core scoring methods ──────────────────────────────────────────────

    /**
     * @deprecated #529: log10 scoring removed.
     */
    @Deprecated
    public double scoreLatency(double latencyMs) {
        throw new UnsupportedOperationException("#529: log10 scoring has been removed. Use baseline comparison only.");
    }

    /**
     * #528: scoreFromMetrics with runSpecId for spec-aware baseline comparison.
     */
    public double scoreFromMetrics(String metricsSummary, String testItem, Long runSpecId) {
        if (metricsSummary == null || metricsSummary.isEmpty()) return 0;
        try {
            JsonNode root = objectMapper.readTree(metricsSummary);
            JsonNode node = MetricsHelper.findMetricsNode(root);
            double chipLatency = MetricsHelper.extractLatency(node);

            if (chipLatency <= 0) {
                if (root.has("score") && !root.get("score").isNull()) {
                    return roundTo2(Math.min(root.get("score").asDouble(), MAX_SCORE_PERCENT));
                }
                return 0;
            }

            if (testItem != null) {
                Map<String, Double> baseline = baselineDataService.getBaselineLatencyMap(runSpecId);
                Double baselineLatency = baseline.get(testItem);
                if (baselineLatency != null && baselineLatency > 0) {
                    return roundTo2(Math.min((baselineLatency / chipLatency) * 100.0, MAX_SCORE_PERCENT));
                }
                for (Map.Entry<String, Double> entry : baseline.entrySet()) {
                    if (testItem.startsWith(entry.getKey()) && entry.getValue() > 0) {
                        return roundTo2(Math.min((entry.getValue() / chipLatency) * 100.0, MAX_SCORE_PERCENT));
                    }
                }
            }

            log.debug("#529: No baseline found for testItem={}, runSpecId={}, score=null", testItem, runSpecId);
            return -1;
        } catch (Exception e) {
            log.warn("Failed to parse metricsSummary: {}", e.getMessage());
            return 0;
        }
    }

    /** Backward compat — uses legacy all-spec baseline */
    public double scoreFromMetrics(String metricsSummary, String testItem) {
        return scoreFromMetrics(metricsSummary, testItem, (Long) null);
    }

    /** Compat (no testItem) */
    public double scoreFromMetrics(String metricsSummary) {
        return scoreFromMetrics(metricsSummary, null, (Long) null);
    }

    /** #530: Score with plan-based spec resolution */
    public double scoreFromMetrics(String metricsSummary, String testItem, EvaluationPlan plan) {
        Long effectiveSpecId = runSpecResolver.resolveRunSpecId(plan);
        return scoreFromMetrics(metricsSummary, testItem, effectiveSpecId);
    }

    /** #434: 计算综合评分 (with tasks for testItem lookup) */
    public double calculateOverallScore(List<EvaluationResult> results, List<EvaluationTask> tasks) {
        Map<Long, EvaluationTask> taskMap = tasks.stream()
                .collect(Collectors.toMap(EvaluationTask::getId, t -> t));

        double[] validScores = results.stream()
                .filter(r -> r.getPassed() != null && r.getPassed())
                .mapToDouble(r -> {
                    EvaluationTask task = taskMap.get(r.getTaskId());
                    String testItem = task != null ? task.getTestItem() : null;
                    return scoreFromMetrics(r.getMetricsSummary(), testItem);
                })
                .filter(s -> s >= 0)
                .toArray();
        return validScores.length > 0
                ? roundTo2(Arrays.stream(validScores).average().orElse(0))
                : 0;
    }

    /** Compat (no tasks) */
    public double calculateOverallScore(List<EvaluationResult> results) {
        double[] validScores = results.stream()
                .filter(r -> r.getPassed() != null && r.getPassed())
                .mapToDouble(r -> scoreFromMetrics(r.getMetricsSummary()))
                .filter(s -> s >= 0)
                .toArray();
        return validScores.length > 0
                ? roundTo2(Arrays.stream(validScores).average().orElse(0))
                : 0;
    }

    /** #528: 按维度分组计算评分 (spec-aware) */
    public Map<String, Double> calculateDimensionScores(
            List<EvaluationResult> results, List<EvaluationTask> tasks, Long runSpecId) {

        Map<Long, EvaluationTask> taskMap = tasks.stream()
                .collect(Collectors.toMap(EvaluationTask::getId, t -> t));

        Map<String, List<Double>> dimScores = new LinkedHashMap<>();

        for (EvaluationResult result : results) {
            if (result.getPassed() == null || !result.getPassed()) continue;
            EvaluationTask task = taskMap.get(result.getTaskId());
            if (task == null || task.getTestItem() == null) continue;

            String dimension = DimensionRegistry.getKeyByOperator(task.getTestItem());
            double score = scoreFromMetrics(result.getMetricsSummary(), task.getTestItem(), runSpecId);
            if (score < 0) continue;
            dimScores.computeIfAbsent(dimension, k -> new ArrayList<>()).add(score);
        }

        Map<String, Double> averaged = new LinkedHashMap<>();
        for (Map.Entry<String, List<Double>> entry : dimScores.entrySet()) {
            averaged.put(entry.getKey(),
                    roundTo2(entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0)));
        }
        return averaged;
    }

    /** Backward compat — legacy baseline */
    public Map<String, Double> calculateDimensionScores(
            List<EvaluationResult> results, List<EvaluationTask> tasks) {
        return calculateDimensionScores(results, tasks, null);
    }

    /** Get dimension key for testItem */
    public String getDimension(String testItem) {
        return DimensionRegistry.getKeyByOperator(testItem);
    }

    /** 生成算子排行 */
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
            double rawScore = scoreFromMetrics(result.getMetricsSummary(), testItem);

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
            if (rawScore < 0 && "VALID".equals(dataStatus)) {
                item.put("score", null);
                item.put("noBaseline", true);
                item.put("noBaselineNote", "无同规格基准数据");
            } else {
                item.put("score", rawScore < 0 ? null : rawScore);
            }
            item.put("dataStatus", dataStatus);

            try {
                if (result.getMetricsSummary() != null) {
                    JsonNode metrics = objectMapper.readTree(result.getMetricsSummary());
                    JsonNode metricsNode = MetricsHelper.findMetricsNode(metrics);
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
