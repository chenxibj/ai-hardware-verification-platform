package com.lab.chipreport;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResultRepository;
import com.lab.result.EvaluationResultService;
import com.lab.scoring.ScoringService;
import com.lab.task.EvaluationTask;
import com.lab.task.FailureType;
import com.lab.task.EvaluationTaskRepository;
import com.lab.node.ComputeNodeRepository;
import com.lab.runspec.RunSpecRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import com.lab.plan.PlanCompletedEvent;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.annotation.Async;

/**
 * 报告生成服务 — 编排层
 * #543: 拆分后仅保留报告生成编排逻辑。
 * 分析逻辑（瓶颈分析、场景推荐、算子排行、分类摘要）委托给 ReportDataAssembler
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportGeneratorService {

    private final ChipReportRepository reportRepository;
    private final ChipRepository chipRepository;
    private final EvaluationResultRepository resultRepository;
    private final EvaluationTaskRepository taskRepository;
    private final EvaluationPlanRepository planRepository;
    private final EvaluationResultService resultService;
    private final ObjectMapper objectMapper;
    private final ComputeNodeRepository nodeRepository;
    private final ScoringService scoringService;
    private final RunSpecRepository runSpecRepository;
    private final ApplicationContext applicationContext;
    private final ReportDataAssembler dataAssembler;

    /* #435: dimension detail metadata for radar chart enrichment */
    private static final Map<String, Map<String, Object>> DIM_DETAILS = new LinkedHashMap<>();
    static {
        DIM_DETAILS.put("compute", dimDetail("计算",
            "衡量芯片执行核心计算操作的能力", "对 MatMul、Conv2D 等基础计算算子进行 benchmark",
            "vs L40S 百分比 = (L40S基准延迟 / 被测芯片延迟) x 100%",
            ">=100%: 达到基准 | 80-99%: 接近基准 | <80%: 低于基准",
            new String[]{"MatMul", "Conv2D", "GEMM", "Linear"}));
        DIM_DETAILS.put("memory", dimDetail("访存",
            "衡量芯片数据搬运和内存访问效率", "通过 Transpose、Embedding、Concat 等内存密集型操作测量",
            "vs L40S 百分比", ">=100%: 达到基准 | 80-99%: 接近基准 | <80%: 低于基准",
            new String[]{"Transpose", "Embedding", "Concat", "Gather", "Scatter"}));
        DIM_DETAILS.put("communication", dimDetail("通信",
            "衡量多卡/多机间通信效率，影响分布式训练和推理", "通过 AllReduce、AllGather、NCCL、P2P 等集合通信操作测量",
            "vs L40S 百分比", ">=100%: 达到基准 | 80-99%: 接近基准 | <80%: 低于基准",
            new String[]{"AllReduce", "AllGather", "NCCL", "P2P", "Broadcast"}));
        DIM_DETAILS.put("op_compat", dimDetail("算子兼容",
            "衡量芯片对常用激活/归一化/元素算子的兼容性和效率", "对 ReLU、Softmax、LayerNorm、BatchNorm 等进行 benchmark",
            "vs L40S 百分比", ">=100%: 达到基准 | 80-99%: 接近基准 | <80%: 低于基准",
            new String[]{"ReLU", "GeLU", "SiLU", "Softmax", "LayerNorm", "BatchNorm", "RMSNorm"}));
        DIM_DETAILS.put("training", dimDetail("训练",
            "衡量芯片执行模型训练的综合能力", "通过反向传播、梯度计算、优化器等训练相关操作测量",
            "vs L40S 百分比", ">=100%: 达到基准 | 80-99%: 接近基准 | <80%: 低于基准",
            new String[]{"Backward", "Gradient", "Optimizer", "Adam", "SGD"}));
        DIM_DETAILS.put("inference", dimDetail("推理",
            "衡量芯片端到端运行模型推理的综合能力", "通过 Attention、MLP、BERT、LLaMA 等模型推理场景测量",
            "vs L40S 百分比", ">=100%: 达到基准 | 80-99%: 接近基准 | <80%: 低于基准",
            new String[]{"Attention", "ScaledDotProduct", "MLP", "BERT", "LLaMA"}));
        DIM_DETAILS.put("scalability", dimDetail("扩展性",
            "衡量芯片多卡扩展时的性能线性度", "基于芯片 interconnect 带宽、GPU 数量、NVLink 等硬件参数计算",
            "基于芯片规格属性计算", ">=100%: 达到基准 | 80-99%: 接近基准 | <80%: 低于基准",
            new String[]{"Multi-GPU", "Scaling"}));
        DIM_DETAILS.put("ecosystem", dimDetail("生态",
            "衡量芯片软件生态、框架兼容性和工具链成熟度", "基于芯片 softwareStack、supportedPrecisions 等属性量化评分",
            "基于芯片规格属性计算", ">=100%: 达到基准 | 80-99%: 接近基准 | <80%: 低于基准",
            new String[]{"Framework", "CUDA", "Driver"}));
    }

    private static Map<String, Object> dimDetail(String name, String description,
            String evalMethod, String scoringBasis, String scoringStandard, String[] operators) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("name", name); d.put("description", description);
        d.put("evalMethod", evalMethod); d.put("scoringBasis", scoringBasis);
        d.put("scoringStandard", scoringStandard);
        d.put("coveredOperators", Arrays.asList(operators));
        return d;
    }

    // -- Event listener --

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPlanCompleted(PlanCompletedEvent event) {
        try {
            applicationContext.getBean(ReportGeneratorService.class).generateReport(event.getPlanId());
        } catch (Exception e) {
            log.error("Failed to generate report for plan {}", event.getPlanId(), e);
        }
    }

    // -- Core report generation --

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ChipReport generateReport(Long planId) {
        // #518: Idempotency
        Optional<ChipReport> existing = reportRepository.findFirstByPlanId(planId);
        if (existing.isPresent()) {
            log.info("#518: Report already exists for plan {} (reportNo={}), skipping",
                    planId, existing.get().getReportNo());
            return existing.get();
        }

        EvaluationPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));

        // 1. Calculate dimension scores
        Long effectiveRunSpecId = scoringService.resolveRunSpecId(plan);
        Map<String, Double> dimScores = resultService.calculateDimensionScores(planId, effectiveRunSpecId);

        // #435: Calculate scalability and ecosystem dimensions
        enrichWithChipAttributeScores(plan, dimScores);

        // 2. Build operator ranking -- delegated to ReportDataAssembler
        List<Map<String, Object>> operatorRanking =
                dataAssembler.buildOperatorRanking(planId, effectiveRunSpecId);
        List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);

        // 2.1 Recalculate overallScore based on VALID entries
        double overallScore = operatorRanking.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus")))
                .mapToDouble(op -> toDouble(op.get("score")))
                .average().orElse(resultService.calculateOverallScore(dimScores));

        // 2.2 Calculate coverage
        Map<String, Object> coverage = buildCoverage(planId, operatorRanking, tasks);
        double coverageRate = (double) coverage.get("coverageRate");

        // 3. Build radar data
        List<Map<String, Object>> radarData = buildRadarData(dimScores);

        // 4. Build bottleneck analysis -- delegated
        List<Map<String, Object>> bottleneckAnalysis =
                dataAssembler.buildBottleneckAnalysis(dimScores, operatorRanking);
        injectCoverageEntry(bottleneckAnalysis, coverage, coverageRate);

        // 5. Build scenario recommendations -- delegated
        List<Map<String, Object>> scenarioRecommendations =
                dataAssembler.buildScenarioRecommendations(dimScores, overallScore);

        // Assemble and save report
        ChipReport report = buildReport(plan, overallScore, coverageRate, dimScores,
                operatorRanking, radarData, bottleneckAnalysis, scenarioRecommendations,
                coverage, effectiveRunSpecId);

        ChipReport saved = reportRepository.save(report);
        log.info("Generated report {} for plan {} (score={})",
                saved.getReportNo(), plan.getPlanNo(), overallScore);

        // Auto-mark as baseline if coverage >= 50%
        if (coverageRate >= 50.0) {
            markAsBaseline(saved, plan, dimScores, operatorRanking);
        }

        return saved;
    }

    // -- Radar data (kept here: presentation layer, uses DIM_DETAILS) --

    private List<Map<String, Object>> buildRadarData(Map<String, Double> dimScores) {
        List<Map<String, Object>> radarData = new ArrayList<>();
        for (String key : com.lab.dimension.DimensionRegistry.allKeys()) {
            String label = com.lab.dimension.DimensionRegistry.getLabelByKey(key);
            double score = dimScores.getOrDefault(key, 0.0);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("dimension", label);
            item.put("dimKey", key);
            item.put("score", Math.round(score * 10.0) / 10.0);
            Map<String, Object> detail = DIM_DETAILS.get(key);
            if (detail != null) item.put("detail", detail);
            radarData.add(item);
        }
        return radarData;
    }

    // -- Private helper methods --

    private void enrichWithChipAttributeScores(EvaluationPlan plan, Map<String, Double> dimScores) {
        try {
            Chip chip = chipRepository.findById(plan.getChipId()).orElse(null);
            Chip baseline = chipRepository.findByNameContainingIgnoreCase("L40S").stream()
                    .filter(ch -> "CHIP-BASELINE-L40S".equals(ch.getChipNo()))
                    .findFirst().orElse(null);
            if (chip != null && baseline != null) {
                dimScores.put("scalability", calculateScalabilityScore(chip, baseline));
                dimScores.put("ecosystem", calculateEcosystemScore(chip, baseline));
            }
        } catch (Exception e) {
            log.warn("#435: Failed to compute scalability/ecosystem scores: {}", e.getMessage());
        }
    }

    private Map<String, Object> buildCoverage(Long planId,
            List<Map<String, Object>> operatorRanking, List<EvaluationTask> tasks) {
        long validCount = operatorRanking.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus"))).count();
        long noDataCount = operatorRanking.stream()
                .filter(op -> "NO_DATA".equals(op.get("dataStatus"))).count();
        long failedCount = operatorRanking.stream()
                .filter(op -> "FAILED".equals(op.get("dataStatus"))).count();
        long totalCount = operatorRanking.size();
        double coverageRate = totalCount > 0 ? (double) validCount / totalCount * 100 : 0;

        Map<String, Object> coverage = new LinkedHashMap<>();
        coverage.put("totalItems", totalCount);
        coverage.put("validItems", validCount);
        coverage.put("noDataItems", noDataCount);
        coverage.put("failedItems", failedCount);

        // #524: Split failed items by failure type
        long notStartedItems = tasks.stream()
                .filter(t -> t.getFailureType() == FailureType.TIMEOUT_NOT_STARTED).count();
        long agentErrorItems = tasks.stream()
                .filter(t -> t.getFailureType() == FailureType.AGENT_ERROR).count();
        long evalFailedItems = tasks.stream()
                .filter(t -> t.getFailureType() == FailureType.EVAL_FAILED).count();
        long timeoutInProgressItems = tasks.stream()
                .filter(t -> t.getFailureType() == FailureType.TIMEOUT_IN_PROGRESS).count();
        coverage.put("notStartedItems", notStartedItems);
        coverage.put("agentErrorItems", agentErrorItems);
        coverage.put("evalFailedItems", evalFailedItems);
        coverage.put("timeoutInProgressItems", timeoutInProgressItems);
        coverage.put("coverageRate", Math.round(coverageRate * 10.0) / 10.0);
        coverage.put("isComplete", coverageRate >= 80.0);
        coverage.put("note", coverageRate < 80.0
                ? "本报告基于不完整评测数据，部分算子未采集到性能指标，芯片评价可能不完整"
                : "评测覆盖度良好");
        return coverage;
    }

    private void injectCoverageEntry(List<Map<String, Object>> bottleneckAnalysis,
                                     Map<String, Object> coverage, double coverageRate) {
        long validCount = ((Number) coverage.get("validItems")).longValue();
        long totalCount = ((Number) coverage.get("totalItems")).longValue();
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("type", "coverage");
        entry.put("level", coverageRate >= 80.0 ? "info" : "warning");
        entry.put("title", String.format("评测覆盖度: %.0f%% (%d/%d 项有效数据)",
                coverageRate, validCount, totalCount));
        entry.put("detail", coverage.get("note"));
        entry.put("coverage", coverage);
        bottleneckAnalysis.add(0, entry);
    }

    private ChipReport buildReport(EvaluationPlan plan, double overallScore, double coverageRate,
                                   Map<String, Double> dimScores,
                                   List<Map<String, Object>> operatorRanking,
                                   List<Map<String, Object>> radarData,
                                   List<Map<String, Object>> bottleneckAnalysis,
                                   List<Map<String, Object>> scenarioRecommendations,
                                   Map<String, Object> coverage, Long effectiveRunSpecId) {
        ChipReport report = new ChipReport();
        report.setReportNo(generateReportNo(plan.getId()));
        report.setChipId(plan.getChipId());
        report.setPlanId(plan.getId());
        report.setOverallScore(Math.round(overallScore * 10.0) / 10.0);
        report.setStatus(coverageRate >= 30.0
                ? ChipReport.ReportStatus.PUBLISHED : ChipReport.ReportStatus.DRAFT);
        report.setCreatedBy(plan.getCreatedBy());

        fillExecutionEnvironment(report, plan.getId());

        try {
            report.setDimensionScores(objectMapper.writeValueAsString(dimScores));
            report.setOperatorRanking(objectMapper.writeValueAsString(operatorRanking));
            report.setRadarData(objectMapper.writeValueAsString(radarData));
            report.setBottleneckAnalysis(objectMapper.writeValueAsString(bottleneckAnalysis));
            report.setScenarioRecommendations(objectMapper.writeValueAsString(scenarioRecommendations));
            report.setCoverage(objectMapper.writeValueAsString(coverage));
        } catch (Exception e) {
            log.error("Failed to serialize report data", e);
        }

        fillSummaries(report, plan, operatorRanking, dimScores);
        fillBaselineSource(report, plan, effectiveRunSpecId, operatorRanking);

        return report;
    }

    private void fillExecutionEnvironment(ChipReport report, Long planId) {
        try {
            List<EvaluationTask> planTasks = taskRepository.findByPlanId(planId);
            planTasks.stream()
                    .filter(t -> t.getAssignedNodeId() != null)
                    .findFirst()
                    .ifPresent(t -> nodeRepository.findById(t.getAssignedNodeId()).ifPresent(node -> {
                        report.setExecutionNodeName(node.getName());
                        report.setExecutionNodeIp(node.getIpAddress());
                        report.setActualChipModel(node.getChipModel());
                    }));
        } catch (Exception e) {
            log.warn("Failed to set execution environment for report: {}", e.getMessage());
        }
    }

    private void fillSummaries(ChipReport report, EvaluationPlan plan,
                               List<Map<String, Object>> operatorRanking, Map<String, Double> dimScores) {
        try {
            Chip baselineChip = chipRepository.findByNameContainingIgnoreCase("L40S").stream()
                    .filter(ch -> "CHIP-BASELINE-L40S".equals(ch.getChipNo()))
                    .findFirst().orElse(null);
            if (baselineChip != null) {
                report.setBaselineChip(baselineChip.getName() + " (" + baselineChip.getChipNo() + ")");
            }

            // #543: delegate to ReportDataAssembler
            Map<String, Object> trainSummary = dataAssembler.buildCategorySummary(
                    operatorRanking, "training", dimScores.getOrDefault("training", 0.0));
            report.setTrainingSummary(objectMapper.writeValueAsString(trainSummary));

            Map<String, Object> infSummary = dataAssembler.buildCategorySummary(
                    operatorRanking, "inference", dimScores.getOrDefault("inference", 0.0));
            report.setInferenceSummary(objectMapper.writeValueAsString(infSummary));
        } catch (Exception e) {
            log.warn("#436: Failed to fill training/inference summary: {}", e.getMessage());
        }
    }

    private void fillBaselineSource(ChipReport report, EvaluationPlan plan,
                                    Long effectiveRunSpecId, List<Map<String, Object>> operatorRanking) {
        try {
            Map<String, Object> baselineSourceInfo = scoringService.getBaselineSource(effectiveRunSpecId);
            if (plan.getRunSpecId() == null && effectiveRunSpecId != null) {
                baselineSourceInfo.put("inferred", true);
                baselineSourceInfo.put("inferredFrom", "eval_config");
            }
            if (effectiveRunSpecId != null) {
                runSpecRepository.findById(effectiveRunSpecId).ifPresent(rs -> {
                    baselineSourceInfo.put("runSpec", rs.getName());
                    baselineSourceInfo.put("runSpecCode", rs.getCode());
                    baselineSourceInfo.put("gpuPerNode", rs.getGpuPerNode());
                    baselineSourceInfo.put("category", rs.getCategory());
                });
            }
            baselineSourceInfo.put("totalItems", operatorRanking.size());
            report.setBaselineSource(objectMapper.writeValueAsString(baselineSourceInfo));
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
                log.info("Updated chip {} capability profile from baseline report {}",
                        chip.getChipNo(), saved.getReportNo());
            }
        } catch (Exception e) {
            log.error("Failed to writeback chip profile for report {}", saved.getReportNo(), e);
        }
    }

    // -- Score calculation helpers --

    private double calculateScalabilityScore(Chip chip, Chip baseline) {
        double chipBw = chip.getInterconnectBandwidthGbps() != null
                ? chip.getInterconnectBandwidthGbps() : 0;
        double baseBw = baseline.getInterconnectBandwidthGbps() != null
                ? baseline.getInterconnectBandwidthGbps() : 63;
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

    private String generateReportNo(Long planId) {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(ZoneId.of("Asia/Shanghai"))
                .format(Instant.now());
        return "RPT-" + date + "-" + planId;
    }

    private static double toDouble(Object val) {
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0; }
    }
}
