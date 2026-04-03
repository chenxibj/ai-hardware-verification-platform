package com.lab.chipreport;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.result.EvaluationResultService;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
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
    private final EvaluationResultRepository resultRepository;
    private final EvaluationTaskRepository taskRepository;
    private final EvaluationPlanRepository planRepository;
    private final EvaluationResultService resultService;
    private final ObjectMapper objectMapper;

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

    public ChipReport generateReport(Long planId) {
        EvaluationPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));

        // 1. 计算维度评分
        Map<String, Double> dimScores = resultService.calculateDimensionScores(planId);
        double overallScore = resultService.calculateOverallScore(dimScores);

        // 2. 生成算子排行
        List<Map<String, Object>> operatorRanking = buildOperatorRanking(planId);

        // 3. 生成六维雷达图数据
        List<Map<String, Object>> radarData = buildRadarData(dimScores);

        // 4. 生成瓶颈分析
        List<Map<String, Object>> bottleneckAnalysis = buildBottleneckAnalysis(dimScores, operatorRanking);

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
        return saved;
    }

    /**
     * 构建六维雷达图数据
     * 输出: [{dimension: "计算性能", score: 82.1}, ...]
     */
    private List<Map<String, Object>> buildRadarData(Map<String, Double> dimScores) {
        List<Map<String, Object>> radarData = new ArrayList<>();
        for (Map.Entry<String, String> entry : DIM_NAMES.entrySet()) {
            String key = entry.getKey();
            String name = entry.getValue();
            double score = dimScores.getOrDefault(key, 0.0);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("dimension", name);
            item.put("score", Math.round(score * 10.0) / 10.0);
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

        // 1. 性能最差的 3 个算子
        List<Map<String, Object>> sorted = new ArrayList<>(operatorRanking);
        sorted.sort((a, b) -> Double.compare(toDouble(a.get("score")), toDouble(b.get("score"))));
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

                double avgLatency = toDouble(metrics.getOrDefault("latency_mean", metrics.getOrDefault("latencyMean", 0)));
                double p95Latency = toDouble(metrics.getOrDefault("latency_p95", metrics.getOrDefault("latencyP95", 0)));
                double p99Latency = toDouble(metrics.getOrDefault("latency_p99", metrics.getOrDefault("latencyP99", 0)));
                double throughput = toDouble(metrics.getOrDefault("throughput", 0));
                double score = toDouble(metrics.getOrDefault("score", 50));

                String dimension = categorizeToDimension(task);

                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("testItem", name);
                entry.put("dimension", dimension);
                entry.put("latencyMean", Math.round(avgLatency * 100.0) / 100.0);
                entry.put("latencyP95", Math.round(p95Latency * 100.0) / 100.0);
                entry.put("latencyP99", Math.round(p99Latency * 100.0) / 100.0);
                entry.put("throughput", Math.round(throughput * 100.0) / 100.0);
                entry.put("score", Math.round(score * 10.0) / 10.0);
                entry.put("passed", score >= 60.0);
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
