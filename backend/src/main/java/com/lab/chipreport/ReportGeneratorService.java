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
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import com.lab.plan.PlanCompletedEvent;
import org.springframework.context.event.EventListener;
import java.util.stream.Collectors;

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

    /* 六维度中文名称映射 */
    private static final Map<String, String> DIM_NAMES = new LinkedHashMap<>();
    static {
        DIM_NAMES.put("compute_perf", "计算性能");
        DIM_NAMES.put("memory_perf", "访存性能");
        DIM_NAMES.put("math_func", "数学函数");
        DIM_NAMES.put("attention", "Attention能力");
        DIM_NAMES.put("normalization", "归一化性能");
        DIM_NAMES.put("model_inference", "模型推理");
    }

    /**
     * 事件监听：计划完成后自动生成报告
     */
    @Transactional
    @EventListener
    public void onPlanCompleted(PlanCompletedEvent event) {
        try {
            generateReport(event.getPlanId());
        } catch (Exception e) {
            log.error("Failed to generate report for plan {}", event.getPlanId(), e);
        }
    }

    @Transactional
    public ChipReport generateReport(Long planId) {
        EvaluationPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));

        // 1. 计算维度评分
        Map<String, Double> dimScores = resultService.calculateDimensionScores(planId);

        // 2. 生成算子排行 (with three-state: VALID/NO_DATA/FAILED)
        List<Map<String, Object>> operatorRanking = buildOperatorRanking(planId);

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
        report.setReportNo(generateReportNo());
        report.setChipId(plan.getChipId());
        report.setPlanId(planId);
        report.setOverallScore(Math.round(overallScore * 10.0) / 10.0);
        report.setStatus(ChipReport.ReportStatus.PUBLISHED);
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
        } catch (Exception e) {
            log.error("Failed to serialize report data", e);
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

    /* 六维度详细说明 */
    private static final Map<String, Map<String, Object>> DIM_DETAILS = new LinkedHashMap<>();
    static {
        DIM_DETAILS.put("compute_perf", buildDimDetail(
            "计算性能",
            "衡量芯片执行核心计算操作的能力，是AI推理的基础",
            "对 MatMul（矩阵乘法）、Conv2D（卷积）等基础计算算子，在不同输入尺寸下进行 benchmark，测量平均延迟和吞吐量",
            "score = 100 - 20×log₁₀(avg_latency_ms)，延迟越低得分越高",
            "≥80分：优秀 | 60-79分：良好 | 40-59分：一般 | <40分：较差",
            new String[]{"MatMul", "Conv2D", "GEMM", "Linear"}
        ));
        DIM_DETAILS.put("memory_perf", buildDimDetail(
            "访存性能",
            "衡量芯片数据搬运和内存访问效率，影响整体推理流水线效率",
            "通过 Transpose、Embedding Lookup、Concat、Gather/Scatter 等内存密集型操作测量数据搬运延迟",
            "score = 100 - 20×log₁₀(avg_latency_ms)，延迟越低得分越高",
            "≥80分：优秀 | 60-79分：良好 | 40-59分：一般 | <40分：较差",
            new String[]{"Transpose", "Embedding", "Concat", "Gather", "Scatter", "Memcpy", "Bandwidth"}
        ));
        DIM_DETAILS.put("math_func", buildDimDetail(
            "数学函数",
            "衡量芯片执行激活函数等数学运算的能力",
            "对 ReLU、Softmax、GeLU、Sigmoid、Tanh 等常用激活函数进行 benchmark",
            "score = 100 - 20×log₁₀(avg_latency_ms)，延迟越低得分越高",
            "≥80分：优秀 | 60-79分：良好 | 40-59分：一般 | <40分：较差",
            new String[]{"ReLU", "GeLU", "SiLU", "Sigmoid", "Tanh", "Softmax"}
        ));
        DIM_DETAILS.put("attention", buildDimDetail(
            "Attention能力",
            "衡量芯片对 Transformer 架构核心组件的支持能力，直接决定大模型推理性能",
            "通过 Scaled Dot-Product Attention、Flash Attention 等机制进行端到端性能测试",
            "score = 100 - 20×log₁₀(avg_latency_ms)，延迟越低得分越高",
            "≥80分：优秀 | 60-79分：良好 | 40-59分：一般 | <40分：较差",
            new String[]{"ScaledDotProduct", "FlashAttention"}
        ));
        DIM_DETAILS.put("normalization", buildDimDetail(
            "归一化性能",
            "衡量芯片执行归一化操作的效率，是现代深度学习模型的标配组件",
            "对 LayerNorm、BatchNorm、RMSNorm 进行不同维度输入的 benchmark",
            "score = 100 - 20×log₁₀(avg_latency_ms)，延迟越低得分越高",
            "≥80分：优秀 | 60-79分：良好 | 40-59分：一般 | <40分：较差",
            new String[]{"LayerNorm", "BatchNorm", "RMSNorm"}
        ));
        DIM_DETAILS.put("model_inference", buildDimDetail(
            "模型推理",
            "衡量芯片端到端运行完整模型的综合能力",
            "部署 MLP、ResNet、BERT、LLaMA 等不同规模模型，测量多 batch size 下的推理延迟和吞吐量",
            "score = 100 - 20×log₁₀(avg_latency_ms)，延迟越低得分越高",
            "≥80分：优秀 | 60-79分：良好 | 40-59分：一般 | <40分：较差",
            new String[]{"MLP", "ResNet", "BERT", "LLaMA"}
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
     * 输出: [{dimension: "计算性能", score: 82.1, dimKey: "compute_perf", detail: {...}}, ...]
     */
    private List<Map<String, Object>> buildRadarData(Map<String, Double> dimScores) {
        List<Map<String, Object>> radarData = new ArrayList<>();
        for (Map.Entry<String, String> entry : DIM_NAMES.entrySet()) {
            String key = entry.getKey();
            String name = entry.getValue();
            double score = dimScores.getOrDefault(key, 0.0);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("dimension", name);
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

        // 1. 性能最差的 3 个算子 (only consider VALID entries)
        List<Map<String, Object>> sorted = operatorRanking.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus")))
                .sorted((a, b) -> Double.compare(toDouble(a.get("score")), toDouble(b.get("score"))))
                .collect(Collectors.toList());
        int worstCount = Math.min(3, sorted.size());
        for (int i = 0; i < worstCount; i++) {
            Map<String, Object> op = sorted.get(i);
            double score = toDouble(op.get("score"));
            String level;
            if (score < 50) level = "error";
            else if (score < 70) level = "warning";
            else level = "info";

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "worst_operator");
            item.put("level", level);
            item.put("title", "低性能算子: " + op.getOrDefault("name", op.getOrDefault("testItem", "Unknown")));
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

        // 3. 薄弱维度警告
        for (Map.Entry<String, Double> entry : dimScores.entrySet()) {
            if (entry.getValue() < 60) {
                String dimName = DIM_NAMES.getOrDefault(entry.getKey(), entry.getKey());
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("type", "weak_dimension");
                item.put("level", entry.getValue() < 40 ? "error" : "warning");
                item.put("title", "薄弱维度: " + dimName);
                item.put("detail", String.format("%s 维度评分仅 %.1f，建议针对性优化", dimName, entry.getValue()));
                item.put("score", Math.round(entry.getValue() * 10.0) / 10.0);
                analysis.add(item);
            }
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

        double computeScore = dimScores.getOrDefault("compute_perf", 0.0);
        double memoryScore = dimScores.getOrDefault("memory_perf", 0.0);
        double mathScore = dimScores.getOrDefault("math_func", 0.0);
        double attentionScore = dimScores.getOrDefault("attention", 0.0);
        double normScore = dimScores.getOrDefault("normalization", 0.0);
        double modelScore = dimScores.getOrDefault("model_inference", 0.0);

        // ✅ 推荐场景
        if (overallScore >= 75 && computeScore >= 85) {
            addRecommendation(recommendations, "recommended", "大规模矩阵运算",
                    String.format("计算性能突出（%.1f分），适合 HPC、科学计算等计算密集型场景", computeScore),
                    Arrays.asList("计算性能"));
        }
        if (overallScore >= 75 && attentionScore >= 85) {
            addRecommendation(recommendations, "recommended", "大语言模型推理",
                    String.format("Attention 能力优秀（%.1f分），适合 LLM 推理和 Transformer 模型部署", attentionScore),
                    Arrays.asList("Attention能力"));
        }
        if (overallScore >= 75 && modelScore >= 85) {
            addRecommendation(recommendations, "recommended", "模型部署服务",
                    String.format("模型推理性能优秀（%.1f分），适合生产环境模型部署", modelScore),
                    Arrays.asList("模型推理"));
        }
        if (overallScore >= 75 && mathScore >= 85) {
            addRecommendation(recommendations, "recommended", "训练加速",
                    String.format("数学函数性能优秀（%.1f分），激活函数高效，适合模型训练", mathScore),
                    Arrays.asList("数学函数"));
        }
        if (overallScore >= 75 && memoryScore >= 85) {
            addRecommendation(recommendations, "recommended", "大批量数据处理",
                    String.format("访存性能优秀（%.1f分），适合大规模数据预处理和 embedding 查询", memoryScore),
                    Arrays.asList("访存性能"));
        }

        // ⚠️ 需关注场景
        if (attentionScore >= 60 && attentionScore < 75) {
            addRecommendation(recommendations, "caution", "Transformer 模型",
                    String.format("Attention 能力中等（%.1f分），部署 Transformer 模型时需关注延迟", attentionScore),
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
        if (normScore >= 60 && normScore < 75) {
            addRecommendation(recommendations, "caution", "深层网络训练",
                    String.format("归一化性能中等（%.1f分），深层网络 LayerNorm/BatchNorm 性能需关注", normScore),
                    Arrays.asList("归一化性能"));
        }

        // ❌ 待验证场景
        if (attentionScore < 60) {
            addRecommendation(recommendations, "unverified", "大语言模型",
                    attentionScore > 0 ?
                        String.format("Attention 维度评分较低（%.1f分），LLM 部署前需充分验证", attentionScore) :
                        "缺少 Attention 维度评测数据，LLM 部署前需补充验证",
                    Arrays.asList("Attention能力"));
        }
        if (modelScore < 60) {
            addRecommendation(recommendations, "unverified", "端到端模型推理",
                    modelScore > 0 ?
                        String.format("模型推理评分较低（%.1f分），生产部署前需验证", modelScore) :
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
                // Three-state scoring: VALID / NO_DATA / FAILED
                double score;
                String dataStatus;
                if (avgLatency > 0 && throughput > 0) {
                    score = Math.max(0, Math.min(100, 100 - 20 * Math.log10(avgLatency)));
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
                entry.put("passed", dataStatus.equals("VALID") && score >= 60.0);
                entry.put("dataStatus", dataStatus);
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
     * 根据任务的 testItem 分类到六维度中文名
     */
    private String categorizeToDimension(EvaluationTask task) {
        if (task == null) return "计算性能";
        String item = task.getTestItem();
        if (item == null) return "计算性能";
        String lower = item.toLowerCase();
        if (lower.contains("matmul") || lower.contains("conv") || lower.contains("gemm") || lower.contains("linear"))
            return "计算性能";
        if (lower.contains("transpose") || lower.contains("embedding") || lower.contains("concat") ||
            lower.contains("gather") || lower.contains("scatter") || lower.contains("memcpy") || lower.contains("bandwidth"))
            return "访存性能";
        if (lower.contains("relu") || lower.contains("gelu") || lower.contains("silu") || lower.contains("sigmoid") ||
            lower.contains("tanh") || lower.contains("softmax"))
            return "数学函数";
        if (lower.contains("attention") || lower.contains("scaleddotproduct") || lower.contains("flash"))
            return "Attention能力";
        if (lower.contains("layernorm") || lower.contains("batchnorm") || lower.contains("rmsnorm") || lower.contains("norm"))
            return "归一化性能";
        if (lower.contains("mlp") || lower.contains("resnet") || lower.contains("bert") || lower.contains("llama") ||
            lower.contains("model") || lower.contains("inference"))
            return "模型推理";
        return "计算性能";
    }

    private String generateReportNo() {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(ZoneId.of("Asia/Shanghai"))
                .format(Instant.now());
        String seq = String.format("%03d", (int) (Math.random() * 1000));
        return "RPT-" + date + "-" + seq;
    }

    private double toDouble(Object val) {
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0; }
    }
}
