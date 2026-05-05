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
 * 报告数据组装服务 — 算子排行构建、指标解析
 * 从 ReportGeneratorService 拆分 (#543)
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

                // #515: Add baseline latency and ratio for scoring explainability
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

        // #524: Include tasks with no result at all
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

    static double toDouble(Object val) {
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0; }
    }

    /**
     * #549: Calculate overall score from operator ranking, properly handling
     * null scores (no-baseline entries).
     *
     * Strategy:
     * 1. If any VALID entries have non-null scores (baseline comparison available),
     *    average only those scores (skip null-score entries).
     * 2. If ALL VALID entries have null scores (no baseline data at all),
     *    use a fallback: pass-rate × 60, capped at 60.
     *    This signals "tests ran successfully but unverified against baseline".
     * 3. If no VALID entries exist at all, return 0.
     */
    static double calculateOverallScoreFromRanking(List<Map<String, Object>> operatorRanking) {
        // Step 1: Try to average only entries with actual baseline-compared scores
        double[] validScores = operatorRanking.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus")))
                .filter(op -> op.get("score") != null)
                .mapToDouble(op -> toDouble(op.get("score")))
                .toArray();

        if (validScores.length > 0) {
            return Arrays.stream(validScores).average().orElse(0);
        }

        // Step 2: Fallback — no baseline scores available
        long validCount = operatorRanking.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus")))
                .count();
        long totalCount = operatorRanking.stream()
                .filter(op -> !"NO_DATA".equals(op.get("dataStatus")) || "VALID".equals(op.get("dataStatus")))
                .count();

        if (validCount == 0 || totalCount == 0) return 0;

        // Fallback score: execution success rate × 60, capped at 60
        // 60 = "passed but unverified" ceiling
        double passRate = (double) validCount / totalCount;
        return Math.round(passRate * 60.0 * 10.0) / 10.0;
    }
}
