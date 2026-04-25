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
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Baseline 数据加载与缓存服务
 * 从 ScoringService 拆分而来 (#543)
 * 负责 L40S baseline latency 数据的加载、缓存、查询
 */
@Slf4j
@Service
public class BaselineDataService {

    private final ObjectMapper objectMapper;
    private final ChipRepository chipRepository;
    private final EvaluationResultRepository resultRepository;
    private final EvaluationTaskRepository taskRepository;
    private final EvaluationPlanRepository planRepository;

    /** #546: Caffeine cache TTL in minutes */
    static final long BASELINE_CACHE_TTL_MINUTES = 10;

    /** #546: Caffeine cache max entries */
    static final long BASELINE_CACHE_MAX_SIZE = 50;

    /**
     * #546: Per-runSpec baseline cache with TTL via Caffeine.
     * runSpecId -> (testItem -> latency_ms_mean)
     */
    private Cache<Long, Map<String, Double>> baselineCacheBySpec;

    /** Legacy cache for backward compat (all specs mixed) */
    private volatile Map<String, Double> baselineLatencyCache = null;

    public BaselineDataService(ObjectMapper objectMapper,
                               ChipRepository chipRepository,
                               EvaluationResultRepository resultRepository,
                               EvaluationTaskRepository taskRepository,
                               EvaluationPlanRepository planRepository) {
        this.objectMapper = objectMapper;
        this.chipRepository = chipRepository;
        this.resultRepository = resultRepository;
        this.taskRepository = taskRepository;
        this.planRepository = planRepository;
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
     * #528: Load L40S baseline latency data filtered by runSpecId.
     * #546: Now uses Caffeine cache with TTL instead of ConcurrentHashMap.
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
     * @deprecated #529: No longer used as fallback.
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
                JsonNode node = MetricsHelper.findMetricsNode(root);
                double lat = MetricsHelper.extractLatency(node);
                if (lat > 0) {
                    latencies.computeIfAbsent(testItem, k -> new ArrayList<>()).add(lat);
                }
            } catch (Exception e) {
                log.debug("Failed to parse L40S baseline metrics for {}: {}", testItem, e.getMessage());
            }
        }
    }

    /**
     * Clear all baseline caches.
     */
    public void clearBaselineCache() {
        baselineLatencyCache = null;
        baselineCacheBySpec.invalidateAll();
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
     * #515: Get baseline latency for a specific test item.
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
     * #528: Get baseline coverage info for a given runSpecId.
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

            List<EvaluationPlan> matchingPlans = planRepository
                    .findByChipIdAndRunSpecIdAndStatus(l40s.getId(), runSpecId, EvaluationPlan.PlanStatus.COMPLETED);

            if (matchingPlans.isEmpty()) {
                source.put("available", false);
                source.put("reason", "无同规格基准数据");
                source.put("runSpecId", runSpecId);
                return source;
            }

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
}
