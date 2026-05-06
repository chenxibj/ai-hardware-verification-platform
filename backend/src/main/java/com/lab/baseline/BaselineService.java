package com.lab.baseline;

import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.runspec.RunSpec;
import com.lab.runspec.RunSpecRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.scoring.ScoringService;
import com.lab.chipreport.ChipReport;
import com.lab.chipreport.ChipReportRepository;
import com.lab.chipreport.ReportGeneratorService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * #528: Baseline management service
 * #531: Baseline staleness warning (isStale)
 * #532: Auto-recommend plans with coverage >= 80% (recommended)
 * #533: Trigger report regeneration on baseline switch
 * #534: Coverage detail with roundCount and stdDev
 * #545: Batch queries to fix N+1 in listBaselines/getBaselineCoverage
 */
@Slf4j
@Service
public class BaselineService {

    private final ChipRepository chipRepository;
    private final EvaluationPlanRepository planRepository;
    private final EvaluationResultRepository resultRepository;
    private final EvaluationTaskRepository taskRepository;
    private final RunSpecRepository runSpecRepository;
    private final ScoringService scoringService;
    private final ChipReportRepository reportRepository;
    private final ReportGeneratorService reportGeneratorService;
    private final ObjectMapper objectMapper;

    /**
     * #531: Baseline staleness warning days (default 90)
     */
    @Value("${ahvp.baseline.stale-warning-days:90}")
    private int staleWarningDays;

    /**
     * #534: Unstable stddev threshold (default 0.3 = 30% coefficient of variation)
     */
    @Value("${ahvp.baseline.unstable-stddev-threshold:0.3}")
    private double unstableStddevThreshold;

    public BaselineService(
            ChipRepository chipRepository,
            EvaluationPlanRepository planRepository,
            EvaluationResultRepository resultRepository,
            EvaluationTaskRepository taskRepository,
            RunSpecRepository runSpecRepository,
            ScoringService scoringService,
            ChipReportRepository reportRepository,
            ReportGeneratorService reportGeneratorService,
            ObjectMapper objectMapper) {
        this.chipRepository = chipRepository;
        this.planRepository = planRepository;
        this.resultRepository = resultRepository;
        this.taskRepository = taskRepository;
        this.runSpecRepository = runSpecRepository;
        this.scoringService = scoringService;
        this.reportRepository = reportRepository;
        this.reportGeneratorService = reportGeneratorService;
        this.objectMapper = objectMapper;
    }

    // Test helpers
    void setStaleWarningDays(int days) {
        this.staleWarningDays = days;
    }

    void setUnstableStddevThreshold(double threshold) {
        this.unstableStddevThreshold = threshold;
    }

    /**
     * List baselines for a chip grouped by run_spec.
     * #531: adds isStale, staleDays per group
     * #532: adds recommended, recommendedPlanId per group
     * #545: batch queries to fix N+1
     */
    public List<Map<String, Object>> listBaselines(Long chipId) {
        Chip chip = chipRepository.findById(chipId)
                .orElseThrow(() -> new RuntimeException("Chip not found: " + chipId));

        List<EvaluationPlan> plans = planRepository.findByChipId(chipId).stream()
                .filter(p -> p.getStatus() == EvaluationPlan.PlanStatus.COMPLETED)
                .filter(p -> p.getRunSpecId() != null)
                .collect(Collectors.toList());

        // #545: Batch-fetch all results and tasks for all plans in one query each
        List<Long> allPlanIds = plans.stream().map(EvaluationPlan::getId).collect(Collectors.toList());

        Map<Long, List<EvaluationResult>> resultsByPlan = Collections.emptyMap();
        Map<Long, List<EvaluationTask>> tasksByPlan = Collections.emptyMap();
        if (!allPlanIds.isEmpty()) {
            resultsByPlan = resultRepository.findByPlanIdIn(allPlanIds).stream()
                    .collect(Collectors.groupingBy(EvaluationResult::getPlanId));
            tasksByPlan = taskRepository.findByPlanIdIn(allPlanIds).stream()
                    .collect(Collectors.groupingBy(EvaluationTask::getPlanId));
        }

        Map<Long, List<EvaluationPlan>> byRunSpec = plans.stream()
                .collect(Collectors.groupingBy(EvaluationPlan::getRunSpecId));

        List<Map<String, Object>> baselines = new ArrayList<>();
        for (Map.Entry<Long, List<EvaluationPlan>> entry : byRunSpec.entrySet()) {
            Long runSpecId = entry.getKey();
            List<EvaluationPlan> specPlans = entry.getValue();

            RunSpec runSpec = runSpecRepository.findById(runSpecId).orElse(null);

            Map<String, Object> group = new LinkedHashMap<>();
            group.put("runSpecId", runSpecId);
            group.put("runSpecName", runSpec != null ? runSpec.getName() : "Unknown");
            group.put("runSpecCode", runSpec != null ? runSpec.getCode() : null);
            group.put("gpuPerNode", runSpec != null ? runSpec.getGpuPerNode() : null);
            group.put("category", runSpec != null ? runSpec.getCategory() : null);

            // Count covered test items using pre-fetched data
            Set<String> coveredItems = new HashSet<>();
            int totalTestItems = 0;
            for (EvaluationPlan plan : specPlans) {
                List<EvaluationResult> results = resultsByPlan.getOrDefault(plan.getId(), Collections.emptyList());
                List<EvaluationTask> tasks = tasksByPlan.getOrDefault(plan.getId(), Collections.emptyList());
                Map<Long, String> taskItemMap = tasks.stream()
                        .filter(t -> t.getTestItem() != null)
                        .collect(Collectors.toMap(EvaluationTask::getId, EvaluationTask::getTestItem));
                totalTestItems = Math.max(totalTestItems, taskItemMap.size());
                for (EvaluationResult r : results) {
                    if (!"FAILED".equals(r.getDataStatus()) && r.getMetricsSummary() != null) {
                        String item = taskItemMap.get(r.getTaskId());
                        if (item != null) coveredItems.add(item);
                    }
                }
            }

            group.put("coveredItems", coveredItems.size());
            group.put("totalTestItems", totalTestItems);
            group.put("planCount", specPlans.size());
            group.put("isDefault", chip.getDefaultBaselinePlanId() != null &&
                    specPlans.stream().anyMatch(p -> p.getId().equals(chip.getDefaultBaselinePlanId())));

            double coverageRate = totalTestItems > 0 ?
                    Math.round(coveredItems.size() * 1000.0 / totalTestItems) / 10.0 : 0;
            group.put("coverageRate", coverageRate);

            // Latest plan
            EvaluationPlan latest = specPlans.stream()
                    .max(Comparator.comparing(p -> p.getCompletedAt() != null ? p.getCompletedAt() : p.getCreatedAt()))
                    .orElse(null);
            if (latest != null) {
                group.put("latestPlanNo", latest.getPlanNo());
                group.put("latestPlanId", latest.getId());
                group.put("evaluatedAt", latest.getCompletedAt() != null ? latest.getCompletedAt().toString() : null);

                // #531: Staleness check
                Instant latestTime = latest.getCompletedAt() != null ? latest.getCompletedAt() : latest.getCreatedAt();
                boolean isStale = latestTime != null &&
                        latestTime.isBefore(Instant.now().minus(staleWarningDays, ChronoUnit.DAYS));
                group.put("isStale", isStale);
                if (isStale) {
                    long daysSince = ChronoUnit.DAYS.between(latestTime, Instant.now());
                    group.put("staleDays", daysSince);
                }
            } else {
                group.put("isStale", false);
            }

            // Plan list with per-plan coverage and recommended flag
            // #545: Use pre-fetched data for computePlanCoverage
            List<Map<String, Object>> planList = new ArrayList<>();
            for (EvaluationPlan plan : specPlans) {
                Map<String, Object> planInfo = new LinkedHashMap<>();
                planInfo.put("planId", plan.getId());
                planInfo.put("planNo", plan.getPlanNo());
                planInfo.put("status", plan.getStatus().name());
                planInfo.put("completedAt", plan.getCompletedAt() != null ? plan.getCompletedAt().toString() : null);
                planInfo.put("totalTasks", plan.getTotalTasks());
                planInfo.put("completedTasks", plan.getCompletedTasks());
                planInfo.put("isDefault", plan.getId().equals(chip.getDefaultBaselinePlanId()));

                double planCoverage = computePlanCoverageFromData(
                        tasksByPlan.getOrDefault(plan.getId(), Collections.emptyList()),
                        resultsByPlan.getOrDefault(plan.getId(), Collections.emptyList()));
                planInfo.put("coverageRate", planCoverage);
                // #532: recommended if coverage >= 80%
                planInfo.put("recommended", planCoverage >= 80.0);

                planList.add(planInfo);
            }
            group.put("plans", planList);

            // #532: Group-level recommended plan
            Optional<Map<String, Object>> recommendedPlan = planList.stream()
                    .filter(p -> (boolean) p.get("recommended"))
                    .max(Comparator.comparingDouble(p -> (double) p.get("coverageRate")));
            if (recommendedPlan.isEmpty()) {
                recommendedPlan = planList.stream()
                        .max(Comparator.comparingDouble(p -> (double) p.get("coverageRate")));
            }
            group.put("recommendedPlanId", recommendedPlan.map(p -> p.get("planId")).orElse(null));

            baselines.add(group);
        }

        baselines.sort((a, b) -> Integer.compare(
                (int) b.getOrDefault("coveredItems", 0),
                (int) a.getOrDefault("coveredItems", 0)));

        return baselines;
    }

    /**
     * #532: Compute coverage rate for a single plan.
     * Delegates to single-query version for backward compatibility (used by findRecommendedPlan).
     */
    double computePlanCoverage(EvaluationPlan plan) {
        List<EvaluationTask> tasks = taskRepository.findByPlanId(plan.getId());
        List<EvaluationResult> results = resultRepository.findByPlanId(plan.getId());
        return computePlanCoverageFromData(tasks, results);
    }

    /**
     * #545: Compute coverage from pre-fetched tasks and results (no DB calls).
     */
    private double computePlanCoverageFromData(List<EvaluationTask> tasks, List<EvaluationResult> results) {
        Set<String> allItems = tasks.stream()
                .filter(t -> t.getTestItem() != null)
                .map(EvaluationTask::getTestItem)
                .collect(Collectors.toSet());

        if (allItems.isEmpty()) return 0;

        Map<Long, String> taskItemMap = tasks.stream()
                .filter(t -> t.getTestItem() != null)
                .collect(Collectors.toMap(EvaluationTask::getId, EvaluationTask::getTestItem));

        Set<String> covered = new HashSet<>();
        for (EvaluationResult r : results) {
            if (!"FAILED".equals(r.getDataStatus()) && r.getMetricsSummary() != null) {
                String item = taskItemMap.get(r.getTaskId());
                if (item != null) covered.add(item);
            }
        }

        return Math.round(covered.size() * 1000.0 / allItems.size()) / 10.0;
    }

    /**
     * #532: Find the recommended plan for auto-selection
     * Prefers plans with coverage >= 80%, falls back to highest coverage
     */
    public Long findRecommendedPlan(Long chipId, Long runSpecId) {
        List<EvaluationPlan> plans;
        if (runSpecId != null) {
            plans = planRepository.findByChipIdAndRunSpecIdAndStatus(
                    chipId, runSpecId, EvaluationPlan.PlanStatus.COMPLETED);
        } else {
            plans = planRepository.findByChipId(chipId).stream()
                    .filter(p -> p.getStatus() == EvaluationPlan.PlanStatus.COMPLETED)
                    .collect(Collectors.toList());
        }

        if (plans.isEmpty()) return null;

        Map<Long, Double> coverageMap = new LinkedHashMap<>();
        for (EvaluationPlan plan : plans) {
            coverageMap.put(plan.getId(), computePlanCoverage(plan));
        }

        Optional<Map.Entry<Long, Double>> recommended = coverageMap.entrySet().stream()
                .filter(e -> e.getValue() >= 80.0)
                .max(Map.Entry.comparingByValue());

        if (recommended.isPresent()) {
            return recommended.get().getKey();
        }

        return coverageMap.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse(null);
    }

    /**
     * Set default baseline plan for a chip.
     * #533: Triggers report regeneration when baseline changes.
     */
    @Transactional
    public Map<String, Object> setDefaultBaseline(Long chipId, Long planId) {
        Chip chip = chipRepository.findById(chipId)
                .orElseThrow(() -> new RuntimeException("Chip not found: " + chipId));

        EvaluationPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));

        if (!plan.getChipId().equals(chipId)) {
            throw new RuntimeException("Plan does not belong to chip");
        }

        if (plan.getStatus() != EvaluationPlan.PlanStatus.COMPLETED) {
            throw new RuntimeException("Plan is not COMPLETED");
        }

        Long previousBaselinePlanId = chip.getDefaultBaselinePlanId();
        chip.setDefaultBaselinePlanId(planId);
        chipRepository.save(chip);

        scoringService.clearBaselineCache();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("chipId", chipId);
        result.put("chipName", chip.getName());
        result.put("defaultBaselinePlanId", planId);
        result.put("planNo", plan.getPlanNo());
        result.put("runSpecId", plan.getRunSpecId());

        // #533: Trigger report regeneration if baseline actually changed
        if (!planId.equals(previousBaselinePlanId)) {
            Long regeneratedReportId = triggerLatestReportRegeneration(chipId);
            result.put("reportRegenerated", regeneratedReportId != null);
            result.put("regeneratedReportId", regeneratedReportId);
        }

        log.info("#528/#533: Set default baseline for chip {} to plan {} (runSpec={})",
                chip.getChipNo(), plan.getPlanNo(), plan.getRunSpecId());

        return result;
    }

    /**
     * #533: Trigger regeneration of the latest report for a chip.
     * #540: Create-before-delete pattern to prevent data loss.
     *       Generate new report first, only delete old one on success.
     *       Exceptions propagate to caller so the outer transaction can roll back.
     */
    Long triggerLatestReportRegeneration(Long chipId) {
        List<ChipReport> reports = reportRepository.findByChipIdOrderByCreatedAtAsc(chipId);
        if (reports.isEmpty()) {
            log.info("#533: No reports found for chip {}, skip regeneration", chipId);
            return null;
        }

        ChipReport latest = reports.get(reports.size() - 1);
        Long planId = latest.getPlanId();

        if (planId == null) {
            log.warn("#533: Latest report {} has no planId, cannot regenerate", latest.getReportNo());
            return null;
        }

        // #540: Generate new report FIRST (create-before-delete pattern)
        // If this fails, the old report is preserved — no data loss.
        ChipReport newReport;
        try {
            newReport = reportGeneratorService.generateReport(planId);
        } catch (Exception e) {
            log.error("#540: Report regeneration failed for chip {} (planId={}). " +
                    "Old report {} is preserved — no data loss. Error: {}",
                    chipId, planId, latest.getReportNo(), e.getMessage(), e);
            throw new RuntimeException("Report regeneration failed for plan " + planId +
                    ": " + e.getMessage(), e);
        }

        // Only delete old report after new one is successfully created
        reportRepository.delete(latest);
        reportRepository.flush();

        log.info("#533/#540: Regenerated report {} -> {} for chip {} (planId={})",
                latest.getReportNo(), newReport.getReportNo(), chipId, planId);
        return newReport.getId();
    }

    /**
     * #533: Manual report regeneration by report ID.
     * #540: Create-before-delete pattern to prevent data loss.
     */
    @Transactional
    public ChipReport regenerateReport(Long reportId) {
        ChipReport existing = reportRepository.findById(reportId)
                .orElseThrow(() -> new RuntimeException("Report not found: " + reportId));

        Long planId = existing.getPlanId();
        if (planId == null) {
            throw new RuntimeException("Report has no associated plan, cannot regenerate");
        }

        // #540: Generate new report FIRST, then delete old one
        ChipReport newReport;
        try {
            newReport = reportGeneratorService.generateReport(planId);
        } catch (Exception e) {
            log.error("#540: Manual report regeneration failed (reportId={}, planId={}). " +
                    "Old report {} is preserved — no data loss. Error: {}",
                    reportId, planId, existing.getReportNo(), e.getMessage(), e);
            throw new RuntimeException("Report regeneration failed for plan " + planId +
                    ": " + e.getMessage(), e);
        }

        reportRepository.delete(existing);
        reportRepository.flush();

        log.info("#533/#540: Manually regenerated report {} -> {} for plan {}",
                existing.getReportNo(), newReport.getReportNo(), planId);

        return newReport;
    }

    /**
     * Get baseline coverage with operator details.
     * #534: Adds roundCount, stdDev, unstable per operator.
     * #545: Batch queries to fix N+1 and eliminate duplicate queries.
     */
    public Map<String, Object> getBaselineCoverage(Long chipId, Long runSpecId) {
        Map<String, Object> coverage = new LinkedHashMap<>();

        Chip chip = null;
        if (chipId != null) {
            chip = chipRepository.findById(chipId).orElse(null);
        }

        Map<String, Double> baselineMap = scoringService.getBaselineLatencyMap(runSpecId);
        coverage.put("baselineCoveredItems", baselineMap.size());
        coverage.put("baselineTestItems", new ArrayList<>(baselineMap.keySet()));

        if (chip != null) {
            List<EvaluationPlan> chipPlans;
            if (runSpecId != null) {
                chipPlans = planRepository.findByChipIdAndRunSpecIdAndStatus(
                        chipId, runSpecId, EvaluationPlan.PlanStatus.COMPLETED);
            } else {
                chipPlans = planRepository.findByChipId(chipId).stream()
                        .filter(p -> p.getStatus() == EvaluationPlan.PlanStatus.COMPLETED)
                        .collect(Collectors.toList());
            }

            // #545: Batch-fetch all tasks and results for chipPlans in one query each
            List<Long> planIds = chipPlans.stream().map(EvaluationPlan::getId).collect(Collectors.toList());
            Map<Long, List<EvaluationTask>> tasksByPlan = Collections.emptyMap();
            Map<Long, List<EvaluationResult>> resultsByPlan = Collections.emptyMap();
            if (!planIds.isEmpty()) {
                tasksByPlan = taskRepository.findByPlanIdIn(planIds).stream()
                        .collect(Collectors.groupingBy(EvaluationTask::getPlanId));
                resultsByPlan = resultRepository.findByPlanIdIn(planIds).stream()
                        .collect(Collectors.groupingBy(EvaluationResult::getPlanId));
            }

            Set<String> chipTestItems = new HashSet<>();
            for (EvaluationPlan plan : chipPlans) {
                List<EvaluationTask> tasks = tasksByPlan.getOrDefault(plan.getId(), Collections.emptyList());
                tasks.stream()
                        .filter(t -> t.getTestItem() != null)
                        .forEach(t -> chipTestItems.add(t.getTestItem()));
            }

            long covered = chipTestItems.stream()
                    .filter(item -> baselineMap.containsKey(item) ||
                            baselineMap.keySet().stream().anyMatch(item::startsWith))
                    .count();

            coverage.put("chipId", chipId);
            coverage.put("chipName", chip.getName());
            coverage.put("chipTestItems", chipTestItems.size());
            coverage.put("coveredByBaseline", covered);
            coverage.put("coverageRate", chipTestItems.isEmpty() ? 0 :
                    Math.round(covered * 1000.0 / chipTestItems.size()) / 10.0);
            coverage.put("uncoveredItems", chipTestItems.stream()
                    .filter(item -> !baselineMap.containsKey(item) &&
                            baselineMap.keySet().stream().noneMatch(item::startsWith))
                    .collect(Collectors.toList()));

            // #534: Per-operator round count and stdDev
            // #545: Pass pre-fetched data to avoid duplicate queries
            List<Map<String, Object>> operatorDetails = buildOperatorDetails(chipPlans, tasksByPlan, resultsByPlan);
            coverage.put("operators", operatorDetails);
        }

        Map<String, Object> source = scoringService.getBaselineSource(runSpecId);
        coverage.put("baselineSource", source);

        if (runSpecId != null) {
            RunSpec runSpec = runSpecRepository.findById(runSpecId).orElse(null);
            if (runSpec != null) {
                coverage.put("runSpecId", runSpecId);
                coverage.put("runSpecName", runSpec.getName());
                coverage.put("runSpecCode", runSpec.getCode());
            }
        }

        return coverage;
    }

    /**
     * #534: Build per-operator details with roundCount and stdDev
     * #545: Accepts pre-fetched data maps to avoid N+1 queries.
     */
    List<Map<String, Object>> buildOperatorDetails(
            List<EvaluationPlan> plans,
            Map<Long, List<EvaluationTask>> tasksByPlan,
            Map<Long, List<EvaluationResult>> resultsByPlan) {
        Map<String, List<Double>> latencyByOperator = new LinkedHashMap<>();

        for (EvaluationPlan plan : plans) {
            List<EvaluationTask> tasks = tasksByPlan.getOrDefault(plan.getId(), Collections.emptyList());
            List<EvaluationResult> results = resultsByPlan.getOrDefault(plan.getId(), Collections.emptyList());

            Map<Long, String> taskItemMap = tasks.stream()
                    .filter(t -> t.getTestItem() != null)
                    .collect(Collectors.toMap(EvaluationTask::getId, EvaluationTask::getTestItem));

            for (EvaluationResult r : results) {
                if ("FAILED".equals(r.getDataStatus()) || r.getMetricsSummary() == null) continue;
                String item = taskItemMap.get(r.getTaskId());
                if (item == null) continue;

                Double latency = extractLatency(r.getMetricsSummary());
                if (latency != null) {
                    latencyByOperator.computeIfAbsent(item, k -> new ArrayList<>()).add(latency);
                }
            }
        }

        List<Map<String, Object>> details = new ArrayList<>();
        for (Map.Entry<String, List<Double>> entry : latencyByOperator.entrySet()) {
            String operator = entry.getKey();
            List<Double> values = entry.getValue();

            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("operator", operator);
            detail.put("roundCount", values.size());

            if (values.size() >= 2) {
                double mean = values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
                double variance = values.stream()
                        .mapToDouble(v -> Math.pow(v - mean, 2))
                        .sum() / (values.size() - 1);  // Sample standard deviation
                double stdDev = Math.sqrt(variance);
                double relativeStdDev = mean > 0 ? stdDev / mean : 0;

                detail.put("meanLatency", Math.round(mean * 1000.0) / 1000.0);
                detail.put("stdDev", Math.round(stdDev * 1000.0) / 1000.0);
                detail.put("relativeStdDev", Math.round(relativeStdDev * 1000.0) / 1000.0);
                detail.put("unstable", relativeStdDev > unstableStddevThreshold);
            } else if (values.size() == 1) {
                detail.put("meanLatency", Math.round(values.get(0) * 1000.0) / 1000.0);
                detail.put("stdDev", 0.0);
                detail.put("relativeStdDev", 0.0);
                detail.put("unstable", false);
            }

            details.add(detail);
        }

        details.sort(Comparator.comparing(d -> (String) d.get("operator")));
        return details;
    }

    /**
     * #534: Build per-operator details (legacy signature for backward compat).
     * Fetches data from DB — only used if called directly (not from getBaselineCoverage).
     */
    List<Map<String, Object>> buildOperatorDetails(List<EvaluationPlan> plans) {
        List<Long> planIds = plans.stream().map(EvaluationPlan::getId).collect(Collectors.toList());
        Map<Long, List<EvaluationTask>> tasksByPlan = Collections.emptyMap();
        Map<Long, List<EvaluationResult>> resultsByPlan = Collections.emptyMap();
        if (!planIds.isEmpty()) {
            tasksByPlan = taskRepository.findByPlanIdIn(planIds).stream()
                    .collect(Collectors.groupingBy(EvaluationTask::getPlanId));
            resultsByPlan = resultRepository.findByPlanIdIn(planIds).stream()
                    .collect(Collectors.groupingBy(EvaluationResult::getPlanId));
        }
        return buildOperatorDetails(plans, tasksByPlan, resultsByPlan);
    }

    /**
     * #534: Extract latency_ms_mean from metrics_summary JSON
     */
    Double extractLatency(String metricsSummary) {
        try {
            JsonNode node = objectMapper.readTree(metricsSummary);
            if (node.has("latency_ms_mean")) {
                return node.get("latency_ms_mean").asDouble();
            }
            if (node.has("avg_latency_ms")) {
                return node.get("avg_latency_ms").asDouble();
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }
}
