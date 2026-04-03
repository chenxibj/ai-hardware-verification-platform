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
 * 当计划所有任务完成时自动调用
 * Issue: #135
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

    /**
     * 为指定计划生成评测报告
     */
    @Transactional
    public ChipReport generateReport(Long planId) {
        log.info("Generating report for plan: {}", planId);

        EvaluationPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));

        // 1. 收集该计划所有 results
        List<EvaluationResult> results = resultRepository.findByPlanId(planId);
        List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);

        if (results.isEmpty()) {
            log.warn("No results found for plan: {}", planId);
            throw new RuntimeException("No results to generate report for plan: " + planId);
        }

        // 2. 计算综合评分
        double overallScore = scoringService.calculateOverallScore(results);

        // 3. 各维度评分
        Map<String, Double> dimensionScores = scoringService.calculateDimensionScores(results, tasks);

        // 4. 雷达数据
        List<Map<String, Object>> radarData = new ArrayList<>();
        for (Map.Entry<String, Double> entry : dimensionScores.entrySet()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("dimension", entry.getKey());
            item.put("score", Math.round(entry.getValue() * 10.0) / 10.0);
            radarData.add(item);
        }

        // 5. 算子排行
        String operatorRanking = scoringService.generateOperatorRanking(results, tasks);

        // 6. 创建 ChipReport
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
            log.error("Failed to serialize scores", e);
            report.setDimensionScores("{}");
            report.setRadarData("[]");
        }

        ChipReport saved = chipReportRepository.save(report);
        log.info("Report generated: {} with overallScore={}", saved.getReportNo(), saved.getOverallScore());

        // 7. 更新芯片状态为 EVALUATED
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

    private String generateReportNo() {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(ZoneId.of("Asia/Shanghai"))
                .format(Instant.now());
        String seq = String.format("%03d", (int) (Math.random() * 1000));
        return "RPT-" + date + "-" + seq;
    }
}
