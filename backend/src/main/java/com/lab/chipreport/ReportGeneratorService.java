package com.lab.chipreport;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.result.EvaluationResultService;
import com.lab.scoring.ScoringService;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import com.lab.plan.PlanCompletedEvent;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.annotation.Async;
import java.util.stream.Collectors;

import com.lab.dimension.DimensionRegistry;

/**
 * 报告生成服务 - 规则引擎（不用 AI）
 * #136 - 计划完成后自动生成芯片评价报告
 * #139 - 六维雷达图 + 瓶颈分析 + 场景推荐
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
    private final ApplicationContext applicationContext;

    /* #459: DIM_NAMES removed — use DimensionRegistry.getLabelByKey() */

    /**
     * #491: 事件监听：计划完成后异步生成报告（独立事务）
     * @Async 确保不阻塞 submitResult 响应
     * @TransactionalEventListener(AFTER_COMMIT) 确保在主事务提交后才触发
     */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPlanCompleted(PlanCompletedEvent event) {
        try {
            // #491: Call through proxy to ensure @Transactional(REQUIRES_NEW) is honored
            applicationContext.getBean(ReportGeneratorService.class).generateReport(event.getPlanId());
        } catch (Exception e) {
            log.error("Failed to generate report for plan {}", event.getPlanId(), e);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ChipReport generateReport(Long planId) {
        // #518: Idempotency — skip if report already exists for this plan
        Optional<ChipReport> existing = reportRepository.findFirstByPlanId(planId);
        if (existing.isPresent()) {
            log.info("#518: Report already exists for plan {} (reportNo={}), skipping", planId, existing.get().getReportNo());
            return existing.get();
        }

        EvaluationPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));

        // 1. 计算维度评分
        Map<String, Double> dimScores = resultService.calculateDimensionScores(planId);

        // #515: Removed baseline 100% forcing — keep raw computed scores for all chips
        Chip targetChip = chipRepository.findById(plan.getChipId()).orElse(null);
        boolean isBaselineChip = targetChip != null && "CHIP-BASELINE-L40S".equals(targetChip.getChipNo());

        // #435: 计算扩展性和生态维度（基于芯片属性 vs L40S）
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

        // 2. 生成算子排行 (with three-state: VALID/NO_DATA/FAILED)
        List<Map<String, Object>> operatorRanking = buildOperatorRanking(planId);

        // #515: Removed baseline 100% forcing for operator ranking — keep raw scores

        // 2.1 Recalculate overallScore based on VALID entries only
        double overallScore = operatorRanking.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus")))
                .mapToDouble(op -> toDouble(op.get("score")))
                .average().orElse(resultService.calculateOverallScore(dimScores));

        // 2.2 Calculate coverage
        long validCount = operatorRanking.stream().filter(op -> "VALID".equals(op.get("dataStatus"))).count();
        long noDataCount = operatorRanking.stream().filter(op -> "NO_DATA".equals(op.get("dataStatus"))).count();
        long failedCount = operatorRanking.stream().filter(op -> "FAILED".equals(op.get("dataStatus"))).count();
        long totalCount = operatorRanking.size();
        double coverageRate = totalCount > 0 ? (double) validCount / totalCount * 100 : 0;

        Map<String, Object> coverage = new LinkedHashMap<>();
        coverage.put("totalItems", totalCount);
        coverage.put("validItems", validCount);
        coverage.put("noDataItems", noDataCount);
        coverage.put("failedItems", failedCount);
        coverage.put("coverageRate", Math.round(coverageRate * 10.0) / 10.0);
        coverage.put("isComplete", coverageRate >= 80.0);
        coverage.put("note", coverageRate < 80.0
                ? "本报告基于不完整评测数据，部分算子未采集到性能指标，芯片评价可能不完整"
                : "评测覆盖度良好");

        // 3. 生成六维雷达图数据
        List<Map<String, Object>> radarData = buildRadarData(dimScores);

        // 4. 生成瓶颈分析
        List<Map<String, Object>> bottleneckAnalysis = buildBottleneckAnalysis(dimScores, operatorRanking);

        // 4.1 Inject coverage as a special entry at the beginning of bottleneck analysis
        Map<String, Object> coverageEntry = new LinkedHashMap<>();
        coverageEntry.put("type", "coverage");
        coverageEntry.put("level", coverageRate >= 80.0 ? "info" : "warning");
        coverageEntry.put("title", String.format("评测覆盖度: %.0f%% (%d/%d 项有效数据)", coverageRate, validCount, totalCount));
        coverageEntry.put("detail", coverage.get("note"));
        coverageEntry.put("coverage", coverage);
        bottleneckAnalysis.add(0, coverageEntry);

        // 5. 生成场景推荐
        List<Map<String, Object>> scenarioRecommendations = buildScenarioRecommendations(dimScores, overallScore);

        // 创建报告
        ChipReport report = new ChipReport();
        report.setReportNo(generateReportNo(planId));
        report.setChipId(plan.getChipId());
        report.setPlanId(planId);
        report.setOverallScore(Math.round(overallScore * 10.0) / 10.0);
        // #517: coverageRate < 30% → DRAFT (requires manual review before publishing)
        report.setStatus(coverageRate >= 30.0 ? ChipReport.ReportStatus.PUBLISHED : ChipReport.ReportStatus.DRAFT);
        report.setCreatedBy(plan.getCreatedBy());

        // Fill execution environment info from tasks
        try {
            List<EvaluationTask> planTasks = taskRepository.findByPlanId(planId);
            // Find the first task with an assigned node
            planTasks.stream()
                    .filter(t -> t.getAssignedNodeId() != null)
                    .findFirst()
                    .ifPresent(t -> {
                        nodeRepository.findById(t.getAssignedNodeId()).ifPresent(node -> {
                            report.setExecutionNodeName(node.getName());
                            report.setExecutionNodeIp(node.getIpAddress());
                            report.setActualChipModel(node.getChipModel());
                        });
                    });
        } catch (Exception e) {
            log.warn("Failed to set execution environment for report: {}", e.getMessage());
        }

        try {
            report.setDimensionScores(objectMapper.writeValueAsString(dimScores));
            report.setOperatorRanking(objectMapper.writeValueAsString(operatorRanking));
            report.setRadarData(objectMapper.writeValueAsString(radarData));
            report.setBottleneckAnalysis(objectMapper.writeValueAsString(bottleneckAnalysis));
            report.setScenarioRecommendations(objectMapper.writeValueAsString(scenarioRecommendations));
            // #517: Store coverage statistics as dedicated field
            report.setCoverage(objectMapper.writeValueAsString(coverage));
        } catch (Exception e) {
            log.error("Failed to serialize report data", e);
        }

        // #436: Fill training_summary, inference_summary, baseline_chip
        try {
            Chip chip = chipRepository.findById(plan.getChipId()).orElse(null);
            Chip baselineChip = chipRepository.findByNameContainingIgnoreCase("L40S").stream()
                    .filter(ch -> "CHIP-BASELINE-L40S".equals(ch.getChipNo()))
                    .findFirst().orElse(null);
            if (baselineChip != null) {
                report.setBaselineChip(baselineChip.getName() + " (" + baselineChip.getChipNo() + ")");
            }

            // Build training summary from training-related results
            Map<String, Object> trainSummary = buildCategorySummary(operatorRanking, "training", dimScores.getOrDefault("training", 0.0));
            report.setTrainingSummary(objectMapper.writeValueAsString(trainSummary));

            // Build inference summary from inference-related results
            Map<String, Object> infSummary = buildCategorySummary(operatorRanking, "inference", dimScores.getOrDefault("inference", 0.0));
            report.setInferenceSummary(objectMapper.writeValueAsString(infSummary));
        } catch (Exception e) {
            log.warn("#436: Failed to fill training/inference summary: {}", e.getMessage());
        }

        ChipReport saved = reportRepository.save(report);
        log.info("Generated report {} for plan {} (score={})", saved.getReportNo(), plan.getPlanNo(), overallScore);

        // Auto-mark as baseline if coverage >= 50%
        if (coverageRate >= 50.0) {
            reportRepository.clearBaselineByChipId(plan.getChipId());
            saved.setIsBaseline(true);
            reportRepository.save(saved);

            // Writeback to chips table
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

        return saved;
    }

    /* #435: 八维度详细说明 */
    private static final Map<String, Map<String, Object>> DIM_DETAILS = new LinkedHashMap<>();
    static {
        DIM_DETAILS.put("compute", buildDimDetail(
            "计算",
            "衡量芯片执行核心计算操作的能力",
            "对 MatMul、Conv2D 等基础计算算子进行 benchmark",
            "vs L40S 百分比 = (L40S基准延迟 / 被测芯片延迟) × 100%",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"MatMul", "Conv2D", "GEMM", "Linear"}
        ));
        DIM_DETAILS.put("memory", buildDimDetail(
            "访存",
            "衡量芯片数据搬运和内存访问效率",
            "通过 Transpose、Embedding、Concat 等内存密集型操作测量",
            "vs L40S 百分比",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"Transpose", "Embedding", "Concat", "Gather", "Scatter"}
        ));
        DIM_DETAILS.put("communication", buildDimDetail(
            "通信",
            "衡量多卡/多机间通信效率，影响分布式训练和推理",
            "通过 AllReduce、AllGather、NCCL、P2P 等集合通信操作测量",
            "vs L40S 百分比",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"AllReduce", "AllGather", "NCCL", "P2P", "Broadcast"}
        ));
        DIM_DETAILS.put("op_compat", buildDimDetail(
            "算子兼容",
            "衡量芯片对常用激活/归一化/元素算子的兼容性和效率",
            "对 ReLU、Softmax、LayerNorm、BatchNorm 等进行 benchmark",
            "vs L40S 百分比",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"ReLU", "GeLU", "SiLU", "Softmax", "LayerNorm", "BatchNorm", "RMSNorm"}
        ));
        DIM_DETAILS.put("training", buildDimDetail(
            "训练",
            "衡量芯片执行模型训练的综合能力",
            "通过反向传播、梯度计算、优化器等训练相关操作测量",
            "vs L40S 百分比",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"Backward", "Gradient", "Optimizer", "Adam", "SGD"}
        ));
        DIM_DETAILS.put("inference", buildDimDetail(
            "推理",
            "衡量芯片端到端运行模型推理的综合能力",
            "通过 Attention、MLP、BERT、LLaMA 等模型推理场景测量",
            "vs L40S 百分比",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"Attention", "ScaledDotProduct", "MLP", "BERT", "LLaMA"}
        ));
        DIM_DETAILS.put("scalability", buildDimDetail(
            "扩展性",
            "衡量芯片多卡扩展时的性能线性度",
            "基于芯片 interconnect 带宽、GPU 数量、NVLink 等硬件参数计算",
            "基于芯片规格属性计算",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"Multi-GPU", "Scaling"}
        ));
        DIM_DETAILS.put("ecosystem", buildDimDetail(
            "生态",
            "衡量芯片软件生态、框架兼容性和工具链成熟度",
            "基于芯片 softwareStack、supportedPrecisions 等属性量化评分",
            "基于芯片规格属性计算",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"Framework", "CUDA", "Driver"}
        ));
    }

    private static Map<String, Object> buildDimDetail(String name, String description,
            String evalMethod, String scoringBasis, String scoringStandard, String[] operators) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("name", name);
        detail.put("description", description);
        detail.put("evalMethod", evalMethod);
        detail.put("scoringBasis", scoringBasis);
        detail.put("scoringStandard", scoringStandard);
        detail.put("coveredOperators", Arrays.asList(operators));
        return detail;
    }

    /**
     * 构建六维雷达图数据（含维度说明）
     * 输出: [{dimension: "计算", score: 82.1, dimKey: "compute", detail: {...}}, ...]
     */
    private List<Map<String, Object>> buildRadarData(Map<String, Double> dimScores) {
        List<Map<String, Object>> radarData = new ArrayList<>();
        for (String key : DimensionRegistry.allKeys()) {
            String label = DimensionRegistry.getLabelByKey(key);
            double score = dimScores.getOrDefault(key, 0.0);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("dimension", label);
            item.put("dimKey", key);
            item.put("score", Math.round(score * 10.0) / 10.0);
            // Add dimension detail
            Map<String, Object> detail = DIM_DETAILS.get(key);
            if (detail != null) {
                item.put("detail", detail);
            }
            radarData.add(item);
        }
        return radarData;
    }

    /**
     * 构建瓶颈分析
     * 输出: [{type: "worst_operator", level: "error|warning|info", title: "...", detail: "...", score: ...}, ...]
     */
    private List<Map<String, Object>> buildBottleneckAnalysis(
            Map<String, Double> dimScores, List<Map<String, Object>> operatorRanking) {
        List<Map<String, Object>> analysis = new ArrayList<>();

        // 1. 性能最差的算子 (only consider VALID entries, skip high-score operators)
        // #470: Only include operators with score < 85 in bottleneck analysis
        List<Map<String, Object>> sorted = operatorRanking.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus")))
                .filter(op -> toDouble(op.get("score")) < 85.0)  // #470: skip high-performance operators
                .sorted((a, b) -> Double.compare(toDouble(a.get("score")), toDouble(b.get("score"))))
                .collect(Collectors.toList());
        int worstCount = Math.min(3, sorted.size());
        for (int i = 0; i < worstCount; i++) {
            Map<String, Object> op = sorted.get(i);
            double score = toDouble(op.get("score"));
            String level;
            String label;
            if (score < 50) {
                level = "error";
                label = "低性能算子";
            } else if (score < 70) {
                level = "warning";
                label = "低性能算子";
            } else {
                // score 70-84: medium performance
                level = "info";
                label = "中等性能算子";
            }

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "worst_operator");
            item.put("level", level);
            item.put("title", label + ": " + op.getOrDefault("name", op.getOrDefault("testItem", "Unknown")));
            item.put("detail", String.format("评分 %.1f，延迟 %.2fms，吞吐 %.1f ops/s",
                    score,
                    toDouble(op.getOrDefault("avgLatency", op.getOrDefault("latencyMean", 0))),
                    toDouble(op.getOrDefault("throughput", 0))));
            item.put("score", Math.round(score * 10.0) / 10.0);
            item.put("operator", op.getOrDefault("name", op.getOrDefault("testItem", "Unknown")));
            analysis.add(item);
        }

        // 2. 波动最大算子（P95 vs Mean 比值最高）
        Map<String, Object> mostVolatile = null;
        double maxRatio = 0;
        for (Map<String, Object> op : operatorRanking) {
            double mean = toDouble(op.getOrDefault("avgLatency", op.getOrDefault("latencyMean", 0)));
            double p95 = toDouble(op.getOrDefault("p95Latency", op.getOrDefault("latencyP95", 0)));
            if (mean > 0 && p95 > 0) {
                double ratio = p95 / mean;
                if (ratio > maxRatio) {
                    maxRatio = ratio;
                    mostVolatile = op;
                }
            }
        }
        if (mostVolatile != null && maxRatio > 1.5) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "high_volatility");
            String level = maxRatio > 3 ? "error" : maxRatio > 2 ? "warning" : "info";
            item.put("level", level);
            item.put("title", "高波动算子: " + mostVolatile.getOrDefault("name",
                    mostVolatile.getOrDefault("testItem", "Unknown")));
            item.put("detail", String.format("P95/Mean 比值 %.1fx，延迟波动较大，可能影响生产稳定性", maxRatio));
            item.put("ratio", Math.round(maxRatio * 10.0) / 10.0);
            analysis.add(item);
        }

        // 3. 薄弱维度警告 (#440: skip dimensions with 0.0 — means no data, not weakness)
        for (Map.Entry<String, Double> entry : dimScores.entrySet()) {
            if (entry.getValue() > 0 && entry.getValue() < 60) {
                String dimName = DimensionRegistry.getLabelByKey(entry.getKey());
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("type", "weak_dimension");
                item.put("level", entry.getValue() < 40 ? "error" : "warning");
                item.put("title", "薄弱维度: " + dimName);
                item.put("detail", String.format("%s 维度评分仅 %.1f，建议针对性优化", dimName, entry.getValue()));
                item.put("score", Math.round(entry.getValue() * 10.0) / 10.0);
                analysis.add(item);
            }
        }

        // #439: 4. 训练推理不平衡检测
        double trainScore = dimScores.getOrDefault("training", 0.0);
        double infScore = dimScores.getOrDefault("inference", 0.0);
        if (trainScore > 0 && infScore > 0 && Math.abs(trainScore - infScore) > 30) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "imbalance");
            item.put("level", "warning");
            String stronger = trainScore > infScore ? "训练" : "推理";
            String weaker = trainScore > infScore ? "推理" : "训练";
            item.put("title", "训练/推理不平衡");
            item.put("detail", String.format("%s(%.1f%%) 显著强于 %s(%.1f%%)，差距 %.1f%%。适合专注 %s 场景，%s 场景慎用。",
                    stronger, Math.max(trainScore, infScore), weaker, Math.min(trainScore, infScore),
                    Math.abs(trainScore - infScore), stronger, weaker));
            analysis.add(item);
        }

        // #439: 5. 显存带宽瓶颈（访存低+推理低 → 显存带宽可能是瓶颈）
        double memScore = dimScores.getOrDefault("memory", 0.0);
        if (memScore > 0 && memScore < 80 && infScore > 0 && infScore < 90) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "memory_bottleneck");
            item.put("level", memScore < 60 ? "error" : "warning");
            item.put("title", "显存带宽可能是瓶颈");
            item.put("detail", String.format("访存性能 %.1f%%，推理性能 %.1f%%。建议检查显存带宽利用率，考虑量化或算子融合优化。", memScore, infScore));
            analysis.add(item);
        }

        // #439: 6. 通信瓶颈检测（多卡分布式训练风险）
        double commScore = dimScores.getOrDefault("communication", 0.0);
        double scaleScore = dimScores.getOrDefault("scalability", 0.0);
        if ((commScore > 0 && commScore < 50) || (scaleScore > 0 && scaleScore < 50)) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "comm_bottleneck");
            item.put("level", "warning");
            item.put("title", "分布式训练风险");
            item.put("detail", String.format("通信评分 %.1f%%，扩展性 %.1f%%。多卡/多机分布式训练可能出现严重通信瓶颈，建议先单卡验证再扩展。",
                    commScore, scaleScore));
            analysis.add(item);
        }

        // #439: 7. 算子通过率检测
        long totalValid = operatorRanking.stream().filter(op -> "VALID".equals(op.get("dataStatus"))).count();
        long totalPassed = operatorRanking.stream().filter(op -> Boolean.TRUE.equals(op.get("passed"))).count();
        if (totalValid > 0) {
            double passRate = (double) totalPassed / totalValid * 100;
            if (passRate < 90) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("type", "low_pass_rate");
                item.put("level", passRate < 70 ? "error" : "warning");
                item.put("title", String.format("算子通过率偏低: %.0f%%", passRate));
                item.put("detail", String.format("%d/%d 算子通过基准测试。未通过算子可能影响模型兼容性和部署可靠性。",
                        totalPassed, totalValid));
                analysis.add(item);
            }
        }

        // #439: 8. 生态适配检测
        double ecoScore = dimScores.getOrDefault("ecosystem", 0.0);
        if (ecoScore > 0 && ecoScore < 70) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "ecosystem_gap");
            item.put("level", "warning");
            item.put("title", "生态支持不足");
            item.put("detail", String.format("生态评分 %.1f%%。支持的精度类型较少或软件栈不完善，可能影响模型适配和开发效率。", ecoScore));
            analysis.add(item);
        }

        // #439: 9. 能效比异常（高TDP但低性能）
        double computeScore = dimScores.getOrDefault("compute", 0.0);
        double overallAvg = dimScores.values().stream().filter(v -> v > 0).mapToDouble(Double::doubleValue).average().orElse(0);
        if (overallAvg < 80 && overallAvg > 0) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "efficiency_concern");
            item.put("level", "info");
            item.put("title", "综合性价比待评估");
            item.put("detail", String.format("有效维度均分 %.1f%%，未达到 L40S 80%% 水平。建议结合价格和功耗评估 TCO。", overallAvg));
            analysis.add(item);
        }

        // #439: 10. 单一强项提示
        List<Map.Entry<String, Double>> highDims = dimScores.entrySet().stream()
                .filter(e -> e.getValue() >= 120).collect(Collectors.toList());
        if (highDims.size() >= 1 && highDims.size() <= 2) {
            String dims = highDims.stream().map(e -> DimensionRegistry.getLabelByKey(e.getKey()) + "(" + String.format("%.0f%%", e.getValue()) + ")")
                    .collect(Collectors.joining("、"));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "single_strength");
            item.put("level", "info");
            item.put("title", "突出优势: " + dims);
            item.put("detail", "这些维度显著超越 L40S，可作为芯片核心卖点和差异化竞争优势。");
            analysis.add(item);
        }

        return analysis;
    }

    /**
     * 构建场景推荐
     * 输出: [{type: "recommended|caution|unverified", scenario: "...", reason: "...", dimensions: [...]}]
     */
    private List<Map<String, Object>> buildScenarioRecommendations(
            Map<String, Double> dimScores, double overallScore) {
        List<Map<String, Object>> recommendations = new ArrayList<>();

        double computeScore = dimScores.getOrDefault("compute", 0.0);
        double memoryScore = dimScores.getOrDefault("memory", 0.0);
        double opCompatScore = dimScores.getOrDefault("op_compat", 0.0);
        double inferenceScore = dimScores.getOrDefault("inference", 0.0);
        
        double trainingScore = dimScores.getOrDefault("training", 0.0);
        double scalabilityScore = dimScores.getOrDefault("scalability", 0.0);
        double ecosystemScore = dimScores.getOrDefault("ecosystem", 0.0);

        // ✅ 推荐场景
        if (overallScore >= 75 && computeScore >= 85) {
            addRecommendation(recommendations, "recommended", "大规模矩阵运算",
                    String.format("计算性能突出（%.1f分），适合 HPC、科学计算等计算密集型场景", computeScore),
                    Arrays.asList("计算性能"));
        }
        if (overallScore >= 75 && inferenceScore >= 85) {
            addRecommendation(recommendations, "recommended", "大语言模型推理",
                    String.format("Attention 能力优秀（%.1f分），适合 LLM 推理和 Transformer 模型部署", inferenceScore),
                    Arrays.asList("Attention能力"));
        }
        if (overallScore >= 75 && inferenceScore >= 85) {
            addRecommendation(recommendations, "recommended", "模型部署服务",
                    String.format("模型推理性能优秀（%.1f分），适合生产环境模型部署", inferenceScore),
                    Arrays.asList("模型推理"));
        }
        if (overallScore >= 75 && opCompatScore >= 85) {
            addRecommendation(recommendations, "recommended", "训练加速",
                    String.format("数学函数性能优秀（%.1f分），激活函数高效，适合模型训练", opCompatScore),
                    Arrays.asList("数学函数"));
        }
        if (overallScore >= 75 && memoryScore >= 85) {
            addRecommendation(recommendations, "recommended", "大批量数据处理",
                    String.format("访存性能优秀（%.1f分），适合大规模数据预处理和 embedding 查询", memoryScore),
                    Arrays.asList("访存性能"));
        }

        // ⚠️ 需关注场景
        if (inferenceScore >= 60 && inferenceScore < 75) {
            addRecommendation(recommendations, "caution", "Transformer 模型",
                    String.format("Attention 能力中等（%.1f分），部署 Transformer 模型时需关注延迟", inferenceScore),
                    Arrays.asList("Attention能力"));
        }
        if (computeScore >= 60 && computeScore < 75) {
            addRecommendation(recommendations, "caution", "计算密集型任务",
                    String.format("计算性能中等（%.1f分），大规模矩阵运算可能成为瓶颈", computeScore),
                    Arrays.asList("计算性能"));
        }
        if (memoryScore >= 60 && memoryScore < 75) {
            addRecommendation(recommendations, "caution", "内存密集型任务",
                    String.format("访存性能中等（%.1f分），大批量 embedding 和转置操作需关注", memoryScore),
                    Arrays.asList("访存性能"));
        }
        if (opCompatScore >= 60 && opCompatScore < 75) {
            addRecommendation(recommendations, "caution", "深层网络训练",
                    String.format("归一化性能中等（%.1f分），深层网络 LayerNorm/BatchNorm 性能需关注", opCompatScore),
                    Arrays.asList("归一化性能"));
        }

        // ❌ 待验证场景
        if (inferenceScore < 60) {
            addRecommendation(recommendations, "unverified", "大语言模型",
                    inferenceScore > 0 ?
                        String.format("Attention 维度评分较低（%.1f分），LLM 部署前需充分验证", inferenceScore) :
                        "缺少 Attention 维度评测数据，LLM 部署前需补充验证",
                    Arrays.asList("Attention能力"));
        }
        if (inferenceScore < 60) {
            addRecommendation(recommendations, "unverified", "端到端模型推理",
                    inferenceScore > 0 ?
                        String.format("模型推理评分较低（%.1f分），生产部署前需验证", inferenceScore) :
                        "缺少模型推理评测数据，部署前需补充验证",
                    Arrays.asList("模型推理"));
        }
        if (computeScore < 60) {
            addRecommendation(recommendations, "unverified", "高性能计算",
                    computeScore > 0 ?
                        String.format("计算性能评分较低（%.1f分），HPC 场景需充分验证", computeScore) :
                        "缺少计算性能评测数据，HPC 场景需补充验证",
                    Arrays.asList("计算性能"));
        }

        return recommendations;
    }

    private void addRecommendation(List<Map<String, Object>> list, String type,
                                   String scenario, String reason, List<String> dimensions) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("type", type);
        item.put("scenario", scenario);
        item.put("reason", reason);
        item.put("dimensions", dimensions);
        list.add(item);
    }

    /**
     * 构建算子排行表
     */
    private List<Map<String, Object>> buildOperatorRanking(Long planId) {
        List<EvaluationResult> results = resultRepository.findByPlanId(planId);
        List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);
        Map<Long, EvaluationTask> taskMap = tasks.stream()
                .collect(Collectors.toMap(EvaluationTask::getId, t -> t));

        List<Map<String, Object>> ranking = new ArrayList<>();
        for (EvaluationResult r : results) {
            if (r.getMetricsSummary() == null) continue;
            try {
                Map<String, Object> metrics = objectMapper.readValue(r.getMetricsSummary(), new TypeReference<>() {});
                EvaluationTask task = taskMap.get(r.getTaskId());
                String name = task != null ? task.getTestItem() : "unknown";
                if (name == null) name = task != null ? task.getName() : "unknown";

                // Navigate nested structure: metrics may be at top-level or nested in result.eval_result
                Map<String, Object> flatMetrics = flattenMetrics(metrics);

                double avgLatency = toDouble(flatMetrics.getOrDefault("latency_ms_mean", flatMetrics.getOrDefault("latency_mean", flatMetrics.getOrDefault("latencyMean", flatMetrics.getOrDefault("avg_latency_ms", 0)))));
                double p95Latency = toDouble(flatMetrics.getOrDefault("latency_ms_p95", flatMetrics.getOrDefault("latency_p95", flatMetrics.getOrDefault("latencyP95", 0))));
                double p99Latency = toDouble(flatMetrics.getOrDefault("latency_ms_p99", flatMetrics.getOrDefault("latency_p99", flatMetrics.getOrDefault("latencyP99", 0))));
                double throughput = toDouble(flatMetrics.getOrDefault("throughput_qps", flatMetrics.getOrDefault("throughput_ops", flatMetrics.getOrDefault("throughput", flatMetrics.getOrDefault("avg_throughput_qps", 0)))));
                // Three-state scoring: VALID / NO_DATA / FAILED (#434: vs L40S percentage)
                double score;
                String dataStatus;
                if (avgLatency > 0 && throughput > 0) {
                    score = scoringService.scoreFromMetrics(r.getMetricsSummary(), name);
                    dataStatus = "VALID";
                } else if (r.getPassed() != null && r.getPassed()) {
                    // Agent reported passed but no perf data — valid execution, no metrics
                    score = -1;
                    dataStatus = "NO_DATA";
                } else if (r.getErrorMessage() != null && !r.getErrorMessage().isEmpty()) {
                    score = 0;
                    dataStatus = "FAILED";
                } else {
                    score = -1;
                    dataStatus = "NO_DATA"; // No error, no data = system didn't collect metrics
                }

                String dimension = categorizeToDimension(task);

                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("testItem", name);
                entry.put("dimension", dimension);
                entry.put("latencyMean", Math.round(avgLatency * 100.0) / 100.0);
                entry.put("latencyP95", Math.round(p95Latency * 100.0) / 100.0);
                entry.put("latencyP99", Math.round(p99Latency * 100.0) / 100.0);
                entry.put("throughput", Math.round(throughput * 100.0) / 100.0);
                entry.put("score", dataStatus.equals("NO_DATA") ? null : Math.round(score * 10.0) / 10.0);
                entry.put("passed", dataStatus.equals("VALID") && score >= 80.0); // #434: 80% of L40S baseline
                entry.put("dataStatus", dataStatus);

                // #515: Add baseline latency and ratio for scoring explainability
                if ("VALID".equals(dataStatus) && avgLatency > 0) {
                    Double baselineLat = scoringService.getBaselineLatency(name);
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

        // Sort by score descending
        ranking.sort((a, b) -> Double.compare(toDouble(b.get("score")), toDouble(a.get("score"))));

        // Add rank
        for (int i = 0; i < ranking.size(); i++) {
            ranking.get(i).put("rank", i + 1);
        }

        return ranking;
    }

    /**
     * Flatten nested metrics structure.
     * Agent reports metrics in: {result: {eval_result: {summary: {...}, results: [{...}]}}}
     * This extracts the useful metrics into a flat map.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> flattenMetrics(Map<String, Object> metrics) {
        Map<String, Object> flat = new LinkedHashMap<>(metrics);
        try {
            // Try result.eval_result path
            Object resultObj = metrics.get("result");
            if (resultObj instanceof Map) {
                Map<String, Object> result = (Map<String, Object>) resultObj;
                Object evalResult = result.get("eval_result");
                if (evalResult instanceof Map) {
                    Map<String, Object> eval = (Map<String, Object>) evalResult;
                    // Merge summary fields
                    Object summary = eval.get("summary");
                    if (summary instanceof Map) {
                        flat.putAll((Map<String, Object>) summary);
                    }
                    // Merge first result entry (per-operator metrics)
                    Object results = eval.get("results");
                    if (results instanceof java.util.List) {
                        java.util.List<Object> resultList = (java.util.List<Object>) results;
                        if (!resultList.isEmpty() && resultList.get(0) instanceof Map) {
                            Map<String, Object> firstResult = (Map<String, Object>) resultList.get(0);
                            // Only add fields not already present from summary
                            firstResult.forEach(flat::putIfAbsent);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Failed to flatten metrics: {}", e.getMessage());
        }
        return flat;
    }

    /**
     * #459: Delegates to DimensionRegistry — returns English key
     */
    private String categorizeToDimension(EvaluationTask task) {
        if (task == null) return "compute";
        return DimensionRegistry.getKeyByOperator(task.getTestItem());
    }

    /**
     * #436: Build category summary for training or inference
     */
    private Map<String, Object> buildCategorySummary(
            List<Map<String, Object>> operatorRanking, String dimension, double dimensionScore) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("dimension", dimension);
        summary.put("overallScore", Math.round(dimensionScore * 10.0) / 10.0);

        List<Map<String, Object>> operators = operatorRanking.stream()
                .filter(op -> dimension.equals(op.get("dimension")))
                .collect(Collectors.toList());

        summary.put("operatorCount", operators.size());
        summary.put("validCount", operators.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus"))).count());

        // Best and worst operators
        operators.stream()
                .filter(op -> op.get("score") != null)
                .max((a, b) -> Double.compare(toDouble(a.get("score")), toDouble(b.get("score"))))
                .ifPresent(best -> {
                    summary.put("bestOperator", best.get("testItem"));
                    summary.put("bestScore", toDouble(best.get("score")));
                });

        // #440: Only show worstOperator if it differs from bestOperator
        operators.stream()
                .filter(op -> op.get("score") != null && toDouble(op.get("score")) > 0)
                .min((a, b) -> Double.compare(toDouble(a.get("score")), toDouble(b.get("score"))))
                .ifPresent(worst -> {
                    String worstName = (String) worst.get("testItem");
                    Object bestName = summary.get("bestOperator");
                    if (bestName == null || !bestName.equals(worstName)) {
                        summary.put("worstOperator", worstName);
                        summary.put("worstScore", toDouble(worst.get("score")));
                    }
                });

        // Average latency and throughput
        double avgLatency = operators.stream()
                .filter(op -> toDouble(op.getOrDefault("latencyMean", 0)) > 0)
                .mapToDouble(op -> toDouble(op.get("latencyMean")))
                .average().orElse(0);
        double avgThroughput = operators.stream()
                .filter(op -> toDouble(op.getOrDefault("throughput", 0)) > 0)
                .mapToDouble(op -> toDouble(op.get("throughput")))
                .average().orElse(0);

        summary.put("avgLatencyMs", Math.round(avgLatency * 1000.0) / 1000.0);
        summary.put("avgThroughput", Math.round(avgThroughput * 10.0) / 10.0);

        return summary;
    }

    /**
     * #435: 计算扩展性评分 vs L40S
     * 基于 interconnect 带宽对比
     */
    private double calculateScalabilityScore(Chip chip, Chip baseline) {
        double chipBw = chip.getInterconnectBandwidthGbps() != null ? chip.getInterconnectBandwidthGbps() : 0;
        double baseBw = baseline.getInterconnectBandwidthGbps() != null ? baseline.getInterconnectBandwidthGbps() : 63; // L40S default 63 Gbps PCIe Gen4
        if (baseBw <= 0) return 0;
        return Math.round(chipBw / baseBw * 1000.0) / 10.0; // percentage with 1 decimal
    }

    /**
     * #435: 计算生态评分 vs L40S
     * 基于 supportedPrecisions 数量对比
     */
    private double calculateEcosystemScore(Chip chip, Chip baseline) {
        int chipPrec = countPrecisions(chip.getSupportedPrecisions());
        int basePrec = countPrecisions(baseline.getSupportedPrecisions());
        if (basePrec <= 0) basePrec = 7; // L40S default: FP64,FP32,TF32,FP16,BF16,FP8,INT8
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
                .withZone(ZoneId.of("Asia/Shanghai"))
                .format(Instant.now());
        return "RPT-" + date + "-" + planId;
    }

    private double toDouble(Object val) {
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0; }
    }
}
