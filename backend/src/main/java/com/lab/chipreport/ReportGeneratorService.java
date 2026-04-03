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
import org.springframework.scheduling.annotation.Async;
import java.util.stream.Collectors;

/**
 * 报告生成服务 - 规则引擎（不用 AI）
 * #136 - 计划完成后自动生成简化版芯片评价报告
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

    /**
     * 生成报告（计划完成后调用）
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

        // 计算维度评分
        Map<String, Double> dimScores = resultService.calculateDimensionScores(planId);
        double overallScore = resultService.calculateOverallScore(dimScores);

        // 生成算子排行
        List<Map<String, Object>> operatorRanking = buildOperatorRanking(planId);

        // 创建报告
        ChipReport report = new ChipReport();
        report.setReportNo(generateReportNo());
        report.setChipId(plan.getChipId());
        report.setPlanId(planId);
        report.setOverallScore(overallScore);
        report.setStatus(ChipReport.ReportStatus.PUBLISHED);
        report.setCreatedBy(plan.getCreatedBy());

        try {
            report.setDimensionScores(objectMapper.writeValueAsString(dimScores));
            report.setOperatorRanking(objectMapper.writeValueAsString(operatorRanking));

            // 简化版不生成雷达图数据（MVP-1）
            // 简化版瓶颈分析：规则引擎
            report.setBottleneckAnalysis(generateBottleneckText(dimScores, overallScore));
        } catch (Exception e) {
            log.error("Failed to serialize report data", e);
        }

        ChipReport saved = reportRepository.save(report);
        log.info("Generated report {} for plan {} (score={})", saved.getReportNo(), plan.getPlanNo(), overallScore);
        return saved;
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

                double avgLatency = toDouble(metrics.getOrDefault("latency_mean", 0));
                double p95Latency = toDouble(metrics.getOrDefault("latency_p95", 0));
                double throughput = toDouble(metrics.getOrDefault("throughput", 0));
                double score = toDouble(metrics.getOrDefault("score", 50));

                String status;
                if (avgLatency < 1) status = "优秀";
                else if (avgLatency < 5) status = "正常";
                else status = "较慢";

                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("name", name);
                entry.put("avgLatency", Math.round(avgLatency * 100.0) / 100.0);
                entry.put("p95Latency", Math.round(p95Latency * 100.0) / 100.0);
                entry.put("throughput", Math.round(throughput * 100.0) / 100.0);
                entry.put("score", Math.round(score * 10.0) / 10.0);
                entry.put("status", status);
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
     * 规则引擎：生成瓶颈分析文本
     */
    private String generateBottleneckText(Map<String, Double> dimScores, double overall) {
        StringBuilder sb = new StringBuilder();

        String grade;
        if (overall >= 90) grade = "优秀";
        else if (overall >= 75) grade = "良好";
        else if (overall >= 60) grade = "合格";
        else grade = "待改进";
        sb.append(String.format("综合评价：该芯片综合评分 %.1f 分，评级为【%s】。\n\n", overall, grade));

        // 找出最弱维度
        Map.Entry<String, Double> weakest = dimScores.entrySet().stream()
                .min(Map.Entry.comparingByValue())
                .orElse(null);
        Map.Entry<String, Double> strongest = dimScores.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .orElse(null);

        Map<String, String> dimNames = Map.of(
                "compute_perf", "计算性能",
                "memory_perf", "访存性能",
                "math_func", "数学函数",
                "attention", "Attention",
                "normalization", "归一化",
                "model_inference", "模型推理"
        );

        if (strongest != null) {
            sb.append(String.format("优势维度：%s（%.1f分）表现最佳。\n",
                    dimNames.getOrDefault(strongest.getKey(), strongest.getKey()), strongest.getValue()));
        }
        if (weakest != null && weakest.getValue() < 70) {
            sb.append(String.format("瓶颈维度：%s（%.1f分）是当前主要瓶颈，建议重点优化。\n",
                    dimNames.getOrDefault(weakest.getKey(), weakest.getKey()), weakest.getValue()));
        }

        return sb.toString();
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
