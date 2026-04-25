package com.lab.scoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.runspec.RunSpec;
import com.lab.runspec.RunSpecRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import com.lab.dimension.DimensionRegistry;

/**
 * 评分计算服务
 * Issue: #135, #139 (六维度增强), #434 (vs L40S 百分比), #528 (按规格匹配 baseline)
 * #529 (废弃 log10 fallback), #530 (run_spec_id=NULL 推断规格)
 * #544 (动态加载 GPU→SpecId 映射), #546 (Caffeine cache TTL)
 */
@Slf4j
@Service
public class ScoringService {

    private final ObjectMapper objectMapper;
    private final ChipRepository chipRepository;
    private final EvaluationResultRepository resultRepository;
    private final EvaluationTaskRepository taskRepository;
    private final EvaluationPlanRepository planRepository;
    private final RunSpecRepository runSpecRepository;

    /** #525: Maximum allowed score percentage to prevent extreme outliers */
    private static final double MAX_SCORE_PERCENT = 200.0;

    /** #546: Caffeine cache TTL in minutes */
    static final long BASELINE_CACHE_TTL_MINUTES = 10;

    /** #546: Caffeine cache max entries */
    static final long BASELINE_CACHE_MAX_SIZE = 50;

    /** #527: Round to 2 decimal places to avoid floating point precision tails */
    private static double roundTo2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    /**
     * #544: Dynamic GPU count to runSpecId mapping, loaded from DB at startup.
     * Replaces the old hardcoded Map.of(1, 13L, 2, 14L, 4, 15L, 8, 16L, 0, 11L)
     */
    private volatile Map<Integer, Long> gpuCountToSpecId = new ConcurrentHashMap<>();

    /**
     * #546: Per-runSpec baseline cache with TTL via Caffeine.
     * Replaces ConcurrentHashMap to prevent unbounded growth.
     * runSpecId -> (testItem -> latency_ms_mean)
     */
    private Cache<Long, Map<String, Double>> baselineCacheBySpec;

    /** Legacy cache for backward compat (all specs mixed) */
    private volatile Map<String, Double> baselineLatencyCache = null;

    /**
     * #530: Cache of inferred runSpecId from eval_config for plans with run_spec_id=NULL.
     * Key: planId → inferred runSpecId (or -1 if inference failed/not possible)
     */
    private final Map<Long, Long> inferredSpecCache = new ConcurrentHashMap<>();

    public ScoringService(ObjectMapper objectMapper,
                          ChipRepository chipRepository,
                          EvaluationResultRepository resultRepository,
                          EvaluationTaskRepository taskRepository,
                          EvaluationPlanRepository planRepository,
                          RunSpecRepository runSpecRepository) {
        this.objectMapper = objectMapper;
        this.chipRepository = chipRepository;
        this.resultRepository = resultRepository;
        this.taskRepository = taskRepository;
        this.planRepository = planRepository;
        this.runSpecRepository = runSpecRepository;
        // #546: Initialize Caffeine cache
        this.baselineCacheBySpec = buildBaselineCache();
    }

    /**
     * #546: Build Caffeine cache with TTL and max size.
     */
    private Cache<Long, Map<String, Double>> buildBaselineCache() {
        return Caffeine.newBuilder()
                .expireAfterWrite(BASELINE_CACHE_TTL_MINUTES, TimeUnit.MINUTES)
                .maximumSize(BASELINE_CACHE_MAX_SIZE)
                .build();
    }

    /**
     * #544: Load GPU count → runSpecId mapping from DB at startup.
     * Maps gpuPerNode (from RunSpec entity) to the RunSpec's ID.
     * For CPU specs (gpuPerNode=0), uses the first match.
     */
    @PostConstruct
    public void initGpuCountToSpecIdMapping() {
        try {
            List<RunSpec> allSpecs = runSpecRepository.findAll();
            if (allSpecs.isEmpty()) {
                log.error("#544: run_specs table is empty! GPU count → spec ID mapping will be empty. " +
                        "Scoring inference will not work.");
                gpuCountToSpecId = new ConcurrentHashMap<>();
                return;
            }

            Map<Integer, Long> newMapping = new ConcurrentHashMap<>();
            for (RunSpec spec : allSpecs) {
                int gpuCount = spec.getGpuPerNode() != null ? spec.getGpuPerNode() : 0;
                // For each gpuPerNode value, take the first (lowest ID) match
                // This handles cases where multiple specs might have same gpuPerNode
                newMapping.putIfAbsent(gpuCount, spec.getId());
            }
            gpuCountToSpecId = newMapping;
            log.info("#544: Loaded GPU count → spec ID mapping from DB: {}", gpuCountToSpecId);
        } catch (Exception e) {
            log.error("#544: Failed to load GPU count → spec ID mapping from DB: {}. " +
                    "Scoring inference may not work correctly.", e.getMessage(), e);
            gpuCountToSpecId = new ConcurrentHashMap<>();
        }
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
     * #528: Load L40S baseline latency data filtered by runSpecId.
     * #546: Now uses Caffeine cache with TTL instead of ConcurrentHashMap.
     * Only includes data from COMPLETED plans with matching run_spec_id.
     * Returns map: testItem -> average latency_ms_mean
     */
    public Map<String, Double> getBaselineLatencyMap(Long runSpecId) {
        if (runSpecId == null) {
            return getBaselineLatencyMapLegacy();
        }

        Map<String, Double> cached = baselineCacheBySpec.getIfPresent(runSpecId);
        if (cached != null) {
            return cached;
        }

        Map<String, Double> baseline = loadBaselineForSpec(runSpecId);
        baselineCacheBySpec.put(runSpecId, baseline);
        return baseline;
    }

    /**
     * #546: Load baseline data for a specific runSpecId from DB.
     */
    private Map<String, Double> loadBaselineForSpec(Long specId) {
        Map<String, Double> baseline = new HashMap<>();
        try {
            List<Chip> l40sChips = chipRepository.findByNameContainingIgnoreCase("L40S");
            if (l40sChips.isEmpty()) {
                log.warn("#528: No L40S baseline chip found");
                return baseline;
            }

            Set<Long> l40sChipIds = l40sChips.stream().map(Chip::getId).collect(Collectors.toSet());

            List<Long> planIds = new ArrayList<>();
            for (Long chipId : l40sChipIds) {
                planRepository.findByChipIdAndRunSpecIdAndStatus(chipId, specId, EvaluationPlan.PlanStatus.COMPLETED)
                        .forEach(p -> planIds.add(p.getId()));
            }

            if (planIds.isEmpty()) {
                log.warn("#528: No COMPLETED L40S plans found for runSpecId={}", specId);
                return baseline;
            }

            Map<String, List<Double>> latencies = new HashMap<>();
            for (Long planId : planIds) {
                collectPlanLatencies(planId, latencies);
            }

            for (Map.Entry<String, List<Double>> entry : latencies.entrySet()) {
                double avg = entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0);
                if (avg > 0) baseline.put(entry.getKey(), avg);
            }

            log.info("#528: Loaded L40S baseline for runSpecId={}: {} test items", specId, baseline.size());
        } catch (Exception e) {
            log.error("#528: Failed to load L40S baseline for runSpecId={}: {}", specId, e.getMessage());
        }
        return baseline;
    }

    /**
     * Legacy: Load ALL L40S data without run_spec filtering (backward compat).
     * @deprecated #529: No longer used as fallback. Use spec-aware matching with resolveRunSpecId.
     */
    @Deprecated
    Map<String, Double> getBaselineLatencyMapLegacy() {
        if (baselineLatencyCache != null) return baselineLatencyCache;

        Map<String, Double> baseline = new HashMap<>();
        try {
            List<Chip> l40sChips = chipRepository.findByNameContainingIgnoreCase("L40S");
            if (l40sChips.isEmpty()) {
                log.warn("#434: No L40S baseline chip found");
                baselineLatencyCache = baseline;
                return baseline;
            }

            Set<Long> l40sChipIds = l40sChips.stream().map(Chip::getId).collect(Collectors.toSet());

            List<Long> planIds = new ArrayList<>();
            for (Long chipId : l40sChipIds) {
                planRepository.findByChipId(chipId).forEach(p -> planIds.add(p.getId()));
            }

            if (planIds.isEmpty()) {
                log.warn("#434: No evaluation plans found for L40S chips");
                baselineLatencyCache = baseline;
                return baseline;
            }

            Map<String, List<Double>> latencies = new HashMap<>();
            for (Long planId : planIds) {
                collectPlanLatencies(planId, latencies);
            }

            for (Map.Entry<String, List<Double>> entry : latencies.entrySet()) {
                double avg = entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0);
                if (avg > 0) baseline.put(entry.getKey(), avg);
            }

            log.info("#434: Loaded L40S baseline for {} test items (legacy, all specs)", baseline.size());
        } catch (Exception e) {
            log.error("#434: Failed to load L40S baseline: {}", e.getMessage());
        }

        baselineLatencyCache = baseline;
        return baseline;
    }

    /**
     * Collect latencies from a single plan into the map.
     */
    private void collectPlanLatencies(Long planId, Map<String, List<Double>> latencies) {
        List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);
        List<EvaluationResult> results = resultRepository.findByPlanId(planId);
        Map<Long, String> taskItemMap = tasks.stream()
                .filter(t -> t.getTestItem() != null)
                .collect(Collectors.toMap(EvaluationTask::getId, EvaluationTask::getTestItem));

        for (EvaluationResult r : results) {
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

    /**
     * #530: Resolve the effective runSpecId for a plan.
     * If plan.runSpecId is set, use it directly.
     * If NULL, try to infer from plan.evalConfig JSON (gpuCount field).
     * Returns null if inference is not possible.
     */
    public Long resolveRunSpecId(EvaluationPlan plan) {
        if (plan == null) return null;
        if (plan.getRunSpecId() != null) return plan.getRunSpecId();

        // Check cache first
        Long cached = inferredSpecCache.get(plan.getId());
        if (cached != null) {
            return cached == -1L ? null : cached;
        }

        // Try to infer from eval_config
        Long inferred = inferRunSpecIdFromEvalConfig(plan.getEvalConfig());
        inferredSpecCache.put(plan.getId(), inferred != null ? inferred : -1L);

        if (inferred != null) {
            log.info("#530: Inferred runSpecId={} from eval_config for plan {} (id={})",
                    inferred, plan.getPlanNo(), plan.getId());
        } else {
            log.debug("#530: Cannot infer runSpecId from eval_config for plan {} (id={})",
                    plan.getPlanNo(), plan.getId());
        }
        return inferred;
    }

    /**
     * #530/#544: Infer runSpecId from eval_config JSON string.
     * Uses dynamically loaded gpuCountToSpecId mapping from DB.
     * Looks for gpuCount field and maps to corresponding runSpecId.
     */
    Long inferRunSpecIdFromEvalConfig(String evalConfig) {
        if (evalConfig == null || evalConfig.isEmpty()) return null;
        try {
            JsonNode config = objectMapper.readTree(evalConfig);
            JsonNode gpuCountNode = config.get("gpuCount");
            if (gpuCountNode == null || gpuCountNode.isNull()) {
                // No gpuCount field → assume CPU
                return gpuCountToSpecId.get(0);
            }
            int gpuCount = gpuCountNode.asInt(0);
            Long specId = gpuCountToSpecId.get(gpuCount);
            if (specId != null) {
                return specId;
            }
            // Unknown gpu count → cannot infer
            log.warn("#530: Unknown gpuCount={} in eval_config, cannot infer runSpecId", gpuCount);
            return null;
        } catch (Exception e) {
            log.warn("#530: Failed to parse eval_config for runSpecId inference: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Clear baseline cache (useful when new L40S data is added)
     */
    public void clearBaselineCache() {
        baselineLatencyCache = null;
        baselineCacheBySpec.invalidateAll();
        inferredSpecCache.clear();
    }

    /**
     * #528: Clear cache for a specific runSpec only.
     */
    public void clearBaselineCache(Long runSpecId) {
        if (runSpecId == null) {
            clearBaselineCache();
        } else {
            baselineCacheBySpec.invalidate(runSpecId);
        }
    }

    /**
     * #515: Get baseline latency for a specific test item (for scoring explainability).
     * Uses legacy (all-spec) baseline. For spec-specific, use getBaselineLatency(testItem, runSpecId).
     */
    public Double getBaselineLatency(String testItem) {
        return getBaselineLatency(testItem, (Long) null);
    }

    /**
     * #528: Get baseline latency for a specific test item filtered by runSpecId.
     */
    public Double getBaselineLatency(String testItem, Long runSpecId) {
        if (testItem == null) return null;
        Map<String, Double> baseline = getBaselineLatencyMap(runSpecId);
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
     * #529: scoreLatency (log10) 已废弃。找不到 baseline 时 score=null，不再 fallback。
     * @deprecated Removed in #529. Use scoreFromMetrics with baseline comparison only.
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
            JsonNode node = findMetricsNode(root);
            double chipLatency = extractLatency(node);

            if (chipLatency <= 0) {
                if (root.has("score") && !root.get("score").isNull()) {
                    return roundTo2(Math.min(root.get("score").asDouble(), MAX_SCORE_PERCENT));
                }
                return 0;
            }

            // #528: Try percentage vs L40S baseline (spec-filtered)
            if (testItem != null) {
                Map<String, Double> baseline = getBaselineLatencyMap(runSpecId);
                Double baselineLatency = baseline.get(testItem);
                if (baselineLatency != null && baselineLatency > 0) {
                    return roundTo2(Math.min((baselineLatency / chipLatency) * 100.0, MAX_SCORE_PERCENT));
                }
                // Try prefix match
                for (Map.Entry<String, Double> entry : baseline.entrySet()) {
                    if (testItem.startsWith(entry.getKey()) && entry.getValue() > 0) {
                        return roundTo2(Math.min((entry.getValue() / chipLatency) * 100.0, MAX_SCORE_PERCENT));
                    }
                }
            }

            // #529: No fallback — return -1 to indicate "无同规格基准数据"
            log.debug("#529: No baseline found for testItem={}, runSpecId={}, score=null", testItem, runSpecId);
            return -1;
        } catch (Exception e) {
            log.warn("Failed to parse metricsSummary: {}", e.getMessage());
            return 0;
        }
    }

    /**
     * #434: 从 metricsSummary JSON 中提取延迟并计算 vs L40S 百分比
     * Backward compat — uses legacy all-spec baseline
     */
    public double scoreFromMetrics(String metricsSummary, String testItem) {
        return scoreFromMetrics(metricsSummary, testItem, (Long) null);
    }

    /**
     * 兼容旧调用（无 testItem 参数）
     */
    public double scoreFromMetrics(String metricsSummary) {
        return scoreFromMetrics(metricsSummary, null, (Long) null);
    }

    /**
     * #530: Score from metrics with plan-based spec resolution.
     * If plan.runSpecId is NULL, attempts to infer from evalConfig.
     */
    public double scoreFromMetrics(String metricsSummary, String testItem, EvaluationPlan plan) {
        Long effectiveSpecId = resolveRunSpecId(plan);
        return scoreFromMetrics(metricsSummary, testItem, effectiveSpecId);
    }

    /**
     * #434: 计算综合评分（需要 tasks 来获取 testItem 做 vs L40S 比较）
     */
    public double calculateOverallScore(List<EvaluationResult> results, List<EvaluationTask> tasks) {
        Map<Long, EvaluationTask> taskMap = tasks.stream()
                .collect(Collectors.toMap(EvaluationTask::getId, t -> t));

        // #529: Filter out -1 scores (no baseline) before averaging
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

    /**
     * 兼容旧调用
     */
    public double calculateOverallScore(List<EvaluationResult> results) {
        // #529: Filter out -1 scores (no baseline) before averaging
        double[] validScores = results.stream()
                .filter(r -> r.getPassed() != null && r.getPassed())
                .mapToDouble(r -> scoreFromMetrics(r.getMetricsSummary()))
                .filter(s -> s >= 0)
                .toArray();
        return validScores.length > 0
                ? roundTo2(Arrays.stream(validScores).average().orElse(0))
                : 0;
    }

    /**
     * #528: 按维度分组计算评分（spec-aware）
     */
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
            // #529: Skip entries with no baseline (score=-1)
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

    /**
     * 按维度分组计算评分（backward compat — legacy baseline）
     */
    public Map<String, Double> calculateDimensionScores(
            List<EvaluationResult> results, List<EvaluationTask> tasks) {
        return calculateDimensionScores(results, tasks, null);
    }

    /**
     * 获取 testItem 对应的维度 key（英文）
     */
    public String getDimension(String testItem) {
        return DimensionRegistry.getKeyByOperator(testItem);
    }

    /**
     * #528: Get baseline coverage info for a given runSpecId.
     * Returns map with coveredItems, totalItems, etc.
     */
    public Map<String, Object> getBaselineCoverage(Long runSpecId) {
        Map<String, Double> baseline = getBaselineLatencyMap(runSpecId);
        Map<String, Object> coverage = new LinkedHashMap<>();
        coverage.put("runSpecId", runSpecId);
        coverage.put("coveredItems", baseline.size());
        coverage.put("testItems", new ArrayList<>(baseline.keySet()));
        return coverage;
    }

    /**
     * #528: Get baseline source info for a run_spec_id.
     * Returns detailed info about which L40S plan(s) provided baseline data.
     */
    public Map<String, Object> getBaselineSource(Long runSpecId) {
        Map<String, Object> source = new LinkedHashMap<>();
        try {
            List<Chip> l40sChips = chipRepository.findByNameContainingIgnoreCase("L40S");
            if (l40sChips.isEmpty()) {
                source.put("available", false);
                source.put("reason", "无L40S基准芯片");
                return source;
            }

            Chip l40s = l40sChips.stream()
                    .filter(c -> "CHIP-BASELINE-L40S".equals(c.getChipNo()))
                    .findFirst().orElse(l40sChips.get(0));

            source.put("chipName", l40s.getName());
            source.put("chipNo", l40s.getChipNo());

            if (runSpecId == null) {
                source.put("available", true);
                source.put("matchMode", "all_specs");
                Map<String, Double> baseline = getBaselineLatencyMap(null);
                source.put("coveredItems", baseline.size());
                return source;
            }

            // Find matching L40S plans for this runSpec
            List<EvaluationPlan> matchingPlans = planRepository
                    .findByChipIdAndRunSpecIdAndStatus(l40s.getId(), runSpecId, EvaluationPlan.PlanStatus.COMPLETED);

            if (matchingPlans.isEmpty()) {
                source.put("available", false);
                source.put("reason", "无同规格基准数据");
                source.put("runSpecId", runSpecId);
                return source;
            }

            // Use the latest completed plan
            EvaluationPlan latestPlan = matchingPlans.stream()
                    .max(Comparator.comparing(p -> p.getCompletedAt() != null ? p.getCompletedAt() : p.getCreatedAt()))
                    .orElse(matchingPlans.get(0));

            Map<String, Double> baseline = getBaselineLatencyMap(runSpecId);

            source.put("available", true);
            source.put("matchMode", "same_spec");
            source.put("planNo", latestPlan.getPlanNo());
            source.put("planId", latestPlan.getId());
            source.put("runSpecId", runSpecId);
            source.put("evaluatedAt", latestPlan.getCompletedAt() != null ?
                    latestPlan.getCompletedAt().toString() : null);
            source.put("coveredItems", baseline.size());
            source.put("totalPlans", matchingPlans.size());
        } catch (Exception e) {
            log.error("#528: Failed to get baseline source for runSpecId={}: {}", runSpecId, e.getMessage());
            source.put("available", false);
            source.put("reason", "查询失败: " + e.getMessage());
        }
        return source;
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
            double rawScore = scoreFromMetrics(result.getMetricsSummary(), testItem);

            // Determine dataStatus
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
            // #529: score=-1 means no baseline data available
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
