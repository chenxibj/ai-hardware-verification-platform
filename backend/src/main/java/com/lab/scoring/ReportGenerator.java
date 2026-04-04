package com.lab.scoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.chipreport.ChipReport;
import com.lab.chipreport.ChipReportRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
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

/**
 * 报告自动生成服务
 * Issue: #135, #165 (增强推荐+评级)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportGenerator {

    private final ScoringService scoringService;
    private final EvaluationResultRepository resultRepository;
    private final EvaluationTaskRepository taskRepository;
    private final EvaluationPlanRepository planRepository;
    private final ChipReportRepository chipReportRepository;
    private final ChipRepository chipRepository;
    private final ObjectMapper objectMapper;

    /* 维度中英映射 */
    private static final Map<String, String> DIM_CN = new LinkedHashMap<>();
    static {
        DIM_CN.put("compute_perf", "计算性能");
        DIM_CN.put("memory_perf", "访存性能");
        DIM_CN.put("math_func", "数学函数");
        DIM_CN.put("attention", "Attention能力");
        DIM_CN.put("normalization", "归一化性能");
        DIM_CN.put("model_inference", "模型推理");
    }

    @Transactional
    public ChipReport generateReport(Long planId) {
        log.info("Generating report for plan: {}", planId);

        EvaluationPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));

        List<EvaluationResult> results = resultRepository.findByPlanId(planId);
        List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);

        if (results.isEmpty()) {
            log.warn("No results found for plan: {}", planId);
            throw new RuntimeException("No results to generate report for plan: " + planId);
        }

        // 1. 综合评分
        double overallScore = scoringService.calculateOverallScore(results);

        // 2. 维度评分
        Map<String, Double> dimensionScores = scoringService.calculateDimensionScores(results, tasks);

        // 3. 雷达数据
        List<Map<String, Object>> radarData = new ArrayList<>();
        for (Map.Entry<String, Double> entry : dimensionScores.entrySet()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("dimension", entry.getKey());
            item.put("score", Math.round(entry.getValue() * 10.0) / 10.0);
            radarData.add(item);
        }

        // 4. 算子排行
        String operatorRanking = scoringService.generateOperatorRanking(results, tasks);

        // 5. 瓶颈分析（#165 增强 — 结构化JSON）
        String bottleneckJson = generateBottleneckAnalysis(dimensionScores, results, tasks);

        // 6. 场景推荐（#165 新增）
        String recommendationsJson = generateRecommendations(dimensionScores, overallScore);

        // 7. 创建报告
        ChipReport report = new ChipReport();
        report.setReportNo(generateReportNo());
        report.setChipId(plan.getChipId());
        report.setPlanId(planId);
        report.setOverallScore(Math.round(overallScore * 10.0) / 10.0);
        report.setOperatorRanking(operatorRanking);
        report.setStatus(ChipReport.ReportStatus.PUBLISHED);
        report.setCreatedBy(plan.getCreatedBy());

        try {
            report.setDimensionScores(objectMapper.writeValueAsString(dimensionScores));
            report.setRadarData(objectMapper.writeValueAsString(radarData));
        } catch (Exception e) {
            report.setDimensionScores("{}");
            report.setRadarData("[]");
        }

        report.setBottleneckAnalysis(bottleneckJson);
        report.setScenarioRecommendations(recommendationsJson);

        ChipReport saved = chipReportRepository.save(report);
        log.info("Report generated: {} overallScore={}", saved.getReportNo(), saved.getOverallScore());

        // 更新芯片状态
        try {
            Chip chip = chipRepository.findById(plan.getChipId()).orElse(null);
            if (chip != null) {
                chip.setStatus(Chip.ChipStatus.EVALUATED);
                chipRepository.save(chip);
                log.info("Updated chip {} status to EVALUATED", chip.getChipNo());
            }
        } catch (Exception e) {
            log.warn("Failed to update chip status: {}", e.getMessage());
        }

        return saved;
    }

    /**
     * 生成结构化瓶颈分析 (#165)
     */
    private String generateBottleneckAnalysis(Map<String, Double> dimScores,
                                               List<EvaluationResult> results,
                                               List<EvaluationTask> tasks) {
        List<Map<String, Object>> items = new ArrayList<>();

        // 找薄弱维度 (< 70 分)
        for (Map.Entry<String, Double> e : dimScores.entrySet()) {
            if (e.getValue() < 70) {
                Map<String, Object> item = new LinkedHashMap<>();
                String level = e.getValue() < 50 ? "error" : "warning";
                item.put("level", level);
                item.put("type", "weak_dimension");
                String dimName = DIM_CN.getOrDefault(e.getKey(), e.getKey());
                item.put("title", dimName + " 维度偏低");
                item.put("detail", String.format("%s 评分 %.1f 分，低于基准线 70 分，建议优化该维度算子实现",
                        dimName, e.getValue()));
                item.put("score", Math.round(e.getValue() * 10.0) / 10.0);
                items.add(item);
            }
        }

        // 找最差算子
        try {
            Map<Long, EvaluationTask> taskMap = new HashMap<>();
            for (EvaluationTask t : tasks) taskMap.put(t.getId(), t);

            double worstScore = Double.MAX_VALUE;
            String worstName = null;
            for (EvaluationResult r : results) {
                if (r.getMetricsSummary() == null) continue;
                try {
                    Map<String, Object> m = objectMapper.readValue(r.getMetricsSummary(),
                            new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
                    double score = toDouble(m.getOrDefault("score", 50));
                    if (score < worstScore) {
                        worstScore = score;
                        EvaluationTask t = taskMap.get(r.getTaskId());
                        worstName = t != null ? (t.getTestItem() != null ? t.getTestItem() : t.getName()) : "Unknown";
                    }
                } catch (Exception ignored) {}
            }
            if (worstName != null && worstScore < 60) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("level", worstScore < 40 ? "error" : "warning");
                item.put("type", "worst_operator");
                item.put("title", worstName + " 性能较差");
                item.put("detail", String.format("%s 评分仅 %.1f 分，是当前最大瓶颈点", worstName, worstScore));
                item.put("score", Math.round(worstScore * 10.0) / 10.0);
                items.add(item);
            }
        } catch (Exception e) {
            log.warn("Error generating worst operator bottleneck: {}", e.getMessage());
        }

        // 如果没有瓶颈，给一个提示性的
        if (items.isEmpty()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("level", "info");
            item.put("type", "no_bottleneck");
            item.put("title", "整体表现均衡");
            item.put("detail", "各维度评分均在基准线以上，无明显瓶颈");
            items.add(item);
        }

        try {
            return objectMapper.writeValueAsString(items);
        } catch (Exception e) {
            return "[]";
        }
    }

    /**
     * 基于维度评分生成场景推荐 (#165)
     */
    private String generateRecommendations(Map<String, Double> dimScores, double overallScore) {
        List<Map<String, Object>> recs = new ArrayList<>();

        double compute = dimScores.getOrDefault("compute_perf", 50.0);
        double memory = dimScores.getOrDefault("memory_perf", 50.0);
        double math = dimScores.getOrDefault("math_func", 50.0);
        double attention = dimScores.getOrDefault("attention", 50.0);
        double norm = dimScores.getOrDefault("normalization", 50.0);
        double model = dimScores.getOrDefault("model_inference", 50.0);

        // 推荐场景
        if (compute >= 75 && model >= 70) {
            recs.add(makeRec("recommended", "深度学习训练",
                    String.format("计算性能 %.0f + 模型推理 %.0f，适合高负载训练任务", compute, model),
                    Arrays.asList("计算性能", "模型推理")));
        }
        if (attention >= 70 && norm >= 65 && model >= 65) {
            recs.add(makeRec("recommended", "大模型推理 (LLM Serving)",
                    String.format("Attention %.0f + 归一化 %.0f，适合 Transformer 推理加速", attention, norm),
                    Arrays.asList("Attention能力", "归一化性能", "模型推理")));
        }
        if (math >= 70 && compute >= 65) {
            recs.add(makeRec("recommended", "科学计算 / 数值仿真",
                    String.format("数学函数 %.0f + 计算性能 %.0f，适合数值密集型计算", math, compute),
                    Arrays.asList("数学函数", "计算性能")));
        }
        if (memory >= 70 && compute >= 65) {
            recs.add(makeRec("recommended", "数据预处理 / ETL",
                    String.format("访存性能 %.0f + 计算性能 %.0f，适合高吞吐数据处理", memory, compute),
                    Arrays.asList("访存性能", "计算性能")));
        }

        // 需关注
        if (compute >= 50 && compute < 75 && model >= 50) {
            recs.add(makeRec("caution", "中等规模训练",
                    String.format("计算性能 %.0f 尚可但非顶尖，建议 batch_size 调优", compute),
                    Arrays.asList("计算性能")));
        }
        if (attention >= 50 && attention < 70) {
            recs.add(makeRec("caution", "长序列推理",
                    String.format("Attention %.0f 有优化空间，长序列场景需注意显存", attention),
                    Arrays.asList("Attention能力")));
        }

        // 待验证
        if (memory < 50) {
            recs.add(makeRec("unverified", "大规模 Embedding 查表",
                    String.format("访存性能 %.0f 较低，可能无法胜任大规模 Embedding 任务", memory),
                    Arrays.asList("访存性能")));
        }
        if (overallScore < 60) {
            recs.add(makeRec("unverified", "生产环境部署",
                    String.format("综合评分 %.0f 低于 60，建议先进行针对性优化", overallScore),
                    Arrays.asList("综合评分")));
        }

        // 保证至少有 1 条推荐
        if (recs.stream().noneMatch(r -> "recommended".equals(r.get("type")))) {
            recs.add(makeRec("recommended", "轻量级推理服务",
                    "综合能力可满足轻量级推理场景",
                    Arrays.asList("计算性能", "模型推理")));
        }

        try {
            return objectMapper.writeValueAsString(recs);
        } catch (Exception e) {
            return "[]";
        }
    }

    private Map<String, Object> makeRec(String type, String scenario, String reason, List<String> dimensions) {
        Map<String, Object> rec = new LinkedHashMap<>();
        rec.put("type", type);
        rec.put("scenario", scenario);
        rec.put("reason", reason);
        rec.put("dimensions", dimensions);
        return rec;
    }

    private double toDouble(Object val) {
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0; }
    }

    private String generateReportNo() {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(ZoneId.of("Asia/Shanghai"))
                .format(Instant.now());
        String seq = String.format("%03d", (int) (Math.random() * 1000));
        return "RPT-" + date + "-" + seq;
    }
}
