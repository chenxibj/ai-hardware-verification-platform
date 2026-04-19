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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * #528: Baseline 管理服务
 * 管理芯片的基准评测数据，支持按运行规格分组查看和设置默认 baseline。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BaselineService {

    private final ChipRepository chipRepository;
    private final EvaluationPlanRepository planRepository;
    private final EvaluationResultRepository resultRepository;
    private final EvaluationTaskRepository taskRepository;
    private final RunSpecRepository runSpecRepository;
    private final ScoringService scoringService;

    /**
     * 列出某芯片所有可用的 baseline 数据（按 run_spec 分组）
     */
    public List<Map<String, Object>> listBaselines(Long chipId) {
        Chip chip = chipRepository.findById(chipId)
                .orElseThrow(() -> new RuntimeException("Chip not found: " + chipId));

        // Get all completed plans for this chip
        List<EvaluationPlan> plans = planRepository.findByChipId(chipId).stream()
                .filter(p -> p.getStatus() == EvaluationPlan.PlanStatus.COMPLETED)
                .filter(p -> p.getRunSpecId() != null)
                .collect(Collectors.toList());

        // Group by runSpecId
        Map<Long, List<EvaluationPlan>> byRunSpec = plans.stream()
                .collect(Collectors.groupingBy(EvaluationPlan::getRunSpecId));

        List<Map<String, Object>> baselines = new ArrayList<>();
        for (Map.Entry<Long, List<EvaluationPlan>> entry : byRunSpec.entrySet()) {
            Long runSpecId = entry.getKey();
            List<EvaluationPlan> specPlans = entry.getValue();

            RunSpec runSpec = runSpecRepository.findById(runSpecId).orElse(null);

            Map<String, Object> group = new LinkedHashMap<>();
            group.put("runSpecId", runSpecId);
            group.put("runSpecName", runSpec != null ? runSpec.getName() : "未知规格");
            group.put("runSpecCode", runSpec != null ? runSpec.getCode() : null);
            group.put("gpuPerNode", runSpec != null ? runSpec.getGpuPerNode() : null);
            group.put("category", runSpec != null ? runSpec.getCategory() : null);

            // Count total test items across all plans for this spec
            Set<String> coveredItems = new HashSet<>();
            for (EvaluationPlan plan : specPlans) {
                List<EvaluationResult> results = resultRepository.findByPlanId(plan.getId());
                List<EvaluationTask> tasks = taskRepository.findByPlanId(plan.getId());
                Map<Long, String> taskItemMap = tasks.stream()
                        .filter(t -> t.getTestItem() != null)
                        .collect(Collectors.toMap(EvaluationTask::getId, EvaluationTask::getTestItem));
                for (EvaluationResult r : results) {
                    if (!"FAILED".equals(r.getDataStatus()) && r.getMetricsSummary() != null) {
                        String item = taskItemMap.get(r.getTaskId());
                        if (item != null) coveredItems.add(item);
                    }
                }
            }

            group.put("coveredItems", coveredItems.size());
            group.put("planCount", specPlans.size());
            group.put("isDefault", chip.getDefaultBaselinePlanId() != null &&
                    specPlans.stream().anyMatch(p -> p.getId().equals(chip.getDefaultBaselinePlanId())));

            // Latest plan info
            EvaluationPlan latest = specPlans.stream()
                    .max(Comparator.comparing(p -> p.getCompletedAt() != null ? p.getCompletedAt() : p.getCreatedAt()))
                    .orElse(null);
            if (latest != null) {
                group.put("latestPlanNo", latest.getPlanNo());
                group.put("latestPlanId", latest.getId());
                group.put("evaluatedAt", latest.getCompletedAt() != null ? latest.getCompletedAt().toString() : null);
            }

            // List all plans in this group
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
                planList.add(planInfo);
            }
            group.put("plans", planList);

            baselines.add(group);
        }

        // Sort: more covered items first
        baselines.sort((a, b) -> Integer.compare(
                (int) b.getOrDefault("coveredItems", 0),
                (int) a.getOrDefault("coveredItems", 0)));

        return baselines;
    }

    /**
     * 设置芯片的默认 baseline plan
     */
    @Transactional
    public Map<String, Object> setDefaultBaseline(Long chipId, Long planId) {
        Chip chip = chipRepository.findById(chipId)
                .orElseThrow(() -> new RuntimeException("Chip not found: " + chipId));

        EvaluationPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));

        if (!plan.getChipId().equals(chipId)) {
            throw new RuntimeException("Plan " + planId + " does not belong to chip " + chipId);
        }

        if (plan.getStatus() != EvaluationPlan.PlanStatus.COMPLETED) {
            throw new RuntimeException("Plan " + planId + " is not COMPLETED (status=" + plan.getStatus() + ")");
        }

        chip.setDefaultBaselinePlanId(planId);
        chipRepository.save(chip);

        // Clear scoring cache so new baseline takes effect
        scoringService.clearBaselineCache();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("chipId", chipId);
        result.put("chipName", chip.getName());
        result.put("defaultBaselinePlanId", planId);
        result.put("planNo", plan.getPlanNo());
        result.put("runSpecId", plan.getRunSpecId());

        log.info("#528: Set default baseline for chip {} to plan {} (runSpec={})",
                chip.getChipNo(), plan.getPlanNo(), plan.getRunSpecId());

        return result;
    }

    /**
     * 查询 baseline 覆盖率
     */
    public Map<String, Object> getBaselineCoverage(Long chipId, Long runSpecId) {
        Map<String, Object> coverage = new LinkedHashMap<>();

        // Get chip info
        Chip chip = null;
        if (chipId != null) {
            chip = chipRepository.findById(chipId).orElse(null);
        }

        // Get L40S baseline coverage for the given runSpec
        Map<String, Double> baselineMap = scoringService.getBaselineLatencyMap(runSpecId);
        coverage.put("baselineCoveredItems", baselineMap.size());
        coverage.put("baselineTestItems", new ArrayList<>(baselineMap.keySet()));

        // If chipId provided, compare with chip's test items
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

            Set<String> chipTestItems = new HashSet<>();
            for (EvaluationPlan plan : chipPlans) {
                List<EvaluationTask> tasks = taskRepository.findByPlanId(plan.getId());
                tasks.stream()
                        .filter(t -> t.getTestItem() != null)
                        .forEach(t -> chipTestItems.add(t.getTestItem()));
            }

            // How many of chip's test items have baseline data
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
        }

        // Get baseline source info
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
}
