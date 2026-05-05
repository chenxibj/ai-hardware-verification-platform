package com.lab.chipreport;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.plan.PlanCompletedEvent;
import com.lab.result.EvaluationResultService;
import com.lab.scoring.ScoringService;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.task.FailureType;
import com.lab.node.ComputeNodeRepository;
import com.lab.runspec.RunSpecRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.event.TransactionPhase;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 报告生成服务 — 编排报告生成流程
 * #136 - 计划完成后自动生成芯片评价报告
 * #543 - 拆分: 数据组装 → ReportDataAssembler, 分析洞察 → ReportInsightBuilder
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportGeneratorService {

    private final ChipReportRepository reportRepository;
    private final ChipRepository chipRepository;
    private final EvaluationTaskRepository taskRepository;
    private final EvaluationPlanRepository planRepository;
    private final EvaluationResultService resultService;
    private final ObjectMapper objectMapper;
    private final ComputeNodeRepository nodeRepository;
    private final ScoringService scoringService;
    private final RunSpecRepository runSpecRepository;
    private final ApplicationContext applicationContext;
    private final ReportDataAssembler dataAssembler;
    private final ReportInsightBuilder insightBuilder;

    /**
     * #491: 事件监听：计划完成后异步生成报告（独立事务）
     */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPlanCompleted(PlanCompletedEvent event) {
        try {
            applicationContext.getBean(ReportGeneratorService.class).generateReport(event.getPlanId());
        } catch (Exception e) {
            log.error("Failed to generate report for plan {}", event.getPlanId(), e);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ChipReport generateReport(Long planId) {
        // #518: Idempotency — skip if report already exists
        Optional<ChipReport> existing = reportRepository.findFirstByPlanId(planId);
        if (existing.isPresent()) {
            log.info("#518: Report already exists for plan {} (reportNo={}), skipping",
                    planId, existing.get().getReportNo());
            return existing.get();
        }

        EvaluationPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));

        // 1. 计算维度评分
        Long effectiveRunSpecId = scoringService.resolveRunSpecId(plan);
        Map<String, Double> dimScores = resultService.calculateDimensionScores(planId, effectiveRunSpecId);

        // #435: 计算扩展性和生态维度（基于芯片属性 vs L40S）
        enrichChipAttributeScores(dimScores, plan.getChipId());

        // 2. 生成算子排行
        List<Map<String, Object>> operatorRanking = dataAssembler.buildOperatorRanking(planId, effectiveRunSpecId);

        // 2.1 #549: Recalculate overallScore — skip null-score (no-baseline) entries
        double overallScore = ReportDataAssembler.calculateOverallScoreFromRanking(operatorRanking);

        // 2.2 Calculate coverage
        long validCount = operatorRanking.stream().filter(op -> "VALID".equals(op.get("dataStatus"))).count();
        long noDataCount = operatorRanking.stream().filter(op -> "NO_DATA".equals(op.get("dataStatus"))).count();
        long failedCount = operatorRanking.stream().filter(op -> "FAILED".equals(op.get("dataStatus"))).count();
        long totalCount = operatorRanking.size();
        double coverageRate = totalCount > 0 ? (double) validCount / totalCount * 100 : 0;
        Map<String, Object> coverage = buildCoverage(planId, validCount, noDataCount, failedCount, totalCount, coverageRate);

        // 3-5. 分析洞察
        List<Map<String, Object>> radarData = insightBuilder.buildRadarData(dimScores);
        List<Map<String, Object>> bottleneckAnalysis = insightBuilder.buildBottleneckAnalysis(dimScores, operatorRanking);
        injectCoverageEntry(bottleneckAnalysis, coverageRate, validCount, totalCount, coverage);
        List<Map<String, Object>> scenarioRecs = insightBuilder.buildScenarioRecommendations(dimScores, overallScore);

        // 创建报告
        ChipReport report = new ChipReport();
        report.setReportNo(generateReportNo(planId));
        report.setChipId(plan.getChipId());
        report.setPlanId(planId);
        report.setOverallScore(Math.round(overallScore * 10.0) / 10.0);
        report.setStatus(coverageRate >= 30.0 ? ChipReport.ReportStatus.PUBLISHED : ChipReport.ReportStatus.DRAFT);
        report.setCreatedBy(plan.getCreatedBy());

        fillExecutionEnvironment(report, planId);

        try {
            report.setDimensionScores(objectMapper.writeValueAsString(dimScores));
            report.setOperatorRanking(objectMapper.writeValueAsString(operatorRanking));
            report.setRadarData(objectMapper.writeValueAsString(radarData));
            report.setBottleneckAnalysis(objectMapper.writeValueAsString(bottleneckAnalysis));
            report.setScenarioRecommendations(objectMapper.writeValueAsString(scenarioRecs));
            report.setCoverage(objectMapper.writeValueAsString(coverage));
        } catch (Exception e) {
            log.error("Failed to serialize report data", e);
        }

        fillSummaries(report, plan, operatorRanking, dimScores);
        fillBaselineSource(report, plan, effectiveRunSpecId, operatorRanking);

        ChipReport saved = reportRepository.save(report);
        log.info("Generated report {} for plan {} (score={})", saved.getReportNo(), plan.getPlanNo(), overallScore);

        if (coverageRate >= 50.0) {
            markAsBaseline(saved, plan, dimScores, operatorRanking);
        }
        return saved;
    }

    // ── Private helpers ──

    private void enrichChipAttributeScores(Map<String, Double> dimScores, Long chipId) {
        try {
            Chip chip = chipRepository.findById(chipId).orElse(null);
            Chip baseline = chipRepository.findByNameContainingIgnoreCase("L40S").stream()
                    .filter(ch -> "CHIP-BASELINE-L40S".equals(ch.getChipNo())).findFirst().orElse(null);
            if (chip != null && baseline != null) {
                dimScores.put("scalability", calculateScalabilityScore(chip, baseline));
                dimScores.put("ecosystem", calculateEcosystemScore(chip, baseline));
            }
        } catch (Exception e) {
            log.warn("#435: Failed to compute scalability/ecosystem scores: {}", e.getMessage());
        }
    }

    private Map<String, Object> buildCoverage(Long planId, long validCount, long noDataCount,
            long failedCount, long totalCount, double coverageRate) {
        Map<String, Object> coverage = new LinkedHashMap<>();
        coverage.put("totalItems", totalCount);
        coverage.put("validItems", validCount);
        coverage.put("noDataItems", noDataCount);
        coverage.put("failedItems", failedCount);
        List<EvaluationTask> failedTasks = taskRepository.findByPlanId(planId);
        coverage.put("notStartedItems", failedTasks.stream().filter(t -> t.getFailureType() == FailureType.TIMEOUT_NOT_STARTED).count());
        coverage.put("agentErrorItems", failedTasks.stream().filter(t -> t.getFailureType() == FailureType.AGENT_ERROR).count());
        coverage.put("evalFailedItems", failedTasks.stream().filter(t -> t.getFailureType() == FailureType.EVAL_FAILED).count());
        coverage.put("timeoutInProgressItems", failedTasks.stream().filter(t -> t.getFailureType() == FailureType.TIMEOUT_IN_PROGRESS).count());
        coverage.put("coverageRate", Math.round(coverageRate * 10.0) / 10.0);
        coverage.put("isComplete", coverageRate >= 80.0);
        coverage.put("note", coverageRate < 80.0
                ? "本报告基于不完整评测数据，部分算子未采集到性能指标，芯片评价可能不完整"
                : "评测覆盖度良好");
        return coverage;
    }

    private void injectCoverageEntry(List<Map<String, Object>> bottleneckAnalysis,
            double coverageRate, long validCount, long totalCount, Map<String, Object> coverage) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("type", "coverage");
        entry.put("level", coverageRate >= 80.0 ? "info" : "warning");
        entry.put("title", String.format("评测覆盖度: %.0f%% (%d/%d 项有效数据)", coverageRate, validCount, totalCount));
        entry.put("detail", coverage.get("note"));
        entry.put("coverage", coverage);
        bottleneckAnalysis.add(0, entry);
    }

    private void fillExecutionEnvironment(ChipReport report, Long planId) {
        try {
            taskRepository.findByPlanId(planId).stream()
                    .filter(t -> t.getAssignedNodeId() != null).findFirst()
                    .ifPresent(t -> nodeRepository.findById(t.getAssignedNodeId()).ifPresent(node -> {
                        report.setExecutionNodeName(node.getName());
                        report.setExecutionNodeIp(node.getIpAddress());
                        report.setActualChipModel(node.getChipModel());
                    }));
        } catch (Exception e) {
            log.warn("Failed to set execution environment: {}", e.getMessage());
        }
    }

    private void fillSummaries(ChipReport report, EvaluationPlan plan,
            List<Map<String, Object>> operatorRanking, Map<String, Double> dimScores) {
        try {
            chipRepository.findByNameContainingIgnoreCase("L40S").stream()
                    .filter(ch -> "CHIP-BASELINE-L40S".equals(ch.getChipNo())).findFirst()
                    .ifPresent(bc -> report.setBaselineChip(bc.getName() + " (" + bc.getChipNo() + ")"));
            report.setTrainingSummary(objectMapper.writeValueAsString(
                    insightBuilder.buildCategorySummary(operatorRanking, "training", dimScores.getOrDefault("training", 0.0))));
            report.setInferenceSummary(objectMapper.writeValueAsString(
                    insightBuilder.buildCategorySummary(operatorRanking, "inference", dimScores.getOrDefault("inference", 0.0))));
        } catch (Exception e) {
            log.warn("#436: Failed to fill training/inference summary: {}", e.getMessage());
        }
    }

    private void fillBaselineSource(ChipReport report, EvaluationPlan plan,
            Long effectiveRunSpecId, List<Map<String, Object>> operatorRanking) {
        try {
            Map<String, Object> info = scoringService.getBaselineSource(effectiveRunSpecId);
            if (plan.getRunSpecId() == null && effectiveRunSpecId != null) {
                info.put("inferred", true);
                info.put("inferredFrom", "eval_config");
            }
            if (effectiveRunSpecId != null) {
                runSpecRepository.findById(effectiveRunSpecId).ifPresent(rs -> {
                    info.put("runSpec", rs.getName());
                    info.put("runSpecCode", rs.getCode());
                    info.put("gpuPerNode", rs.getGpuPerNode());
                    info.put("category", rs.getCategory());
                });
            }
            info.put("totalItems", operatorRanking.size());
            report.setBaselineSource(objectMapper.writeValueAsString(info));
        } catch (Exception e) {
            log.warn("#528: Failed to set baseline source: {}", e.getMessage());
        }
    }

    private void markAsBaseline(ChipReport saved, EvaluationPlan plan,
            Map<String, Double> dimScores, List<Map<String, Object>> operatorRanking) {
        reportRepository.clearBaselineByChipId(plan.getChipId());
        saved.setIsBaseline(true);
        reportRepository.save(saved);
        try {
            Chip chip = chipRepository.findById(plan.getChipId()).orElse(null);
            if (chip != null) {
                chip.setCapabilityProfile(saved.getRadarData());
                chip.setProfileData(objectMapper.writeValueAsString(Map.of(
                    "overallScore", saved.getOverallScore(),
                    "dimensionScores", dimScores,
                    "baselineReportId", saved.getId(),
                    "baselineReportNo", saved.getReportNo(),
                    "baselineDate", saved.getCreatedAt() != null ? saved.getCreatedAt().toString() : "",
                    "operatorCount", operatorRanking.size()
                )));
                chipRepository.save(chip);
                log.info("Updated chip {} capability profile from baseline report {}", chip.getChipNo(), saved.getReportNo());
            }
        } catch (Exception e) {
            log.error("Failed to writeback chip profile for report {}", saved.getReportNo(), e);
        }
    }

    private double calculateScalabilityScore(Chip chip, Chip baseline) {
        double chipBw = chip.getInterconnectBandwidthGbps() != null ? chip.getInterconnectBandwidthGbps() : 0;
        double baseBw = baseline.getInterconnectBandwidthGbps() != null ? baseline.getInterconnectBandwidthGbps() : 63;
        if (baseBw <= 0) return 0;
        return Math.round(chipBw / baseBw * 1000.0) / 10.0;
    }

    private double calculateEcosystemScore(Chip chip, Chip baseline) {
        int chipPrec = countPrecisions(chip.getSupportedPrecisions());
        int basePrec = countPrecisions(baseline.getSupportedPrecisions());
        if (basePrec <= 0) basePrec = 7;
        return Math.round((double) chipPrec / basePrec * 1000.0) / 10.0;
    }

    private int countPrecisions(String precisions) {
        if (precisions == null || precisions.isEmpty()) return 0;
        return precisions.split(",").length;
    }

    /**
     * #518: Generate report number using planId for natural uniqueness.
     * Format: RPT-{yyyyMMdd}-{planId}
     */
    private String generateReportNo(Long planId) {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(ZoneId.of("Asia/Shanghai")).format(Instant.now());
        return "RPT-" + date + "-" + planId;
    }
}
