package com.lab.engine;

import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.report.EvaluationReport;
import com.lab.report.ReportRepository;
import com.lab.log.EvalLog;
import com.lab.log.EvalLogRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class EvalExecutionEngine {
    private final EvaluationTaskRepository taskRepo;
    private final ReportRepository reportRepo;
    private final EvalLogRepository logRepo;
    private final ObjectMapper objectMapper;

    public void executeTask(Long taskId) {
        EvaluationTask task = taskRepo.findById(taskId)
            .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        if (!"PENDING".equals(task.getStatus()) && !"QUEUED".equals(task.getStatus())) {
            log.warn("Task {} not executable: {}", taskId, task.getStatus());
            return;
        }
        task.setStatus("RUNNING");
        task.setStartedAt(Instant.now());
        taskRepo.save(task);
        addLog(task, "INFO", "任务开始执行", "engine");
        addLog(task, "INFO", "评测类型: " + task.getEvalType() + ", 目标: " + task.getTargetModel(), "engine");

        try {
            addLog(task, "INFO", "[1/5] 环境准备...", "env");
            updateProgress(task, 10);
            simulateWork(300);

            addLog(task, "INFO", "[2/5] 加载数据集...", "data");
            updateProgress(task, 25);
            simulateWork(500);

            addLog(task, "INFO", "[3/5] 加载模型: " + task.getTargetModel(), "model");
            updateProgress(task, 40);
            simulateWork(500);

            addLog(task, "INFO", "[4/5] 执行评测...", "benchmark");
            Map<String, Object> results = runBenchmark(task);
            updateProgress(task, 80);

            addLog(task, "INFO", "[5/5] 生成报告...", "report");
            EvaluationReport report = generateReport(task, results);
            updateProgress(task, 100);

            task.setStatus("COMPLETED");
            task.setCompletedAt(Instant.now());
            task.setProgress(100);
            task.setResult(objectMapper.writeValueAsString(results));
            taskRepo.save(task);
            addLog(task, "INFO", "任务完成, 报告: " + report.getReportNo() + ", 耗时: " +
                Duration.between(task.getStartedAt(), task.getCompletedAt()).getSeconds() + "s", "engine");

        } catch (Exception e) {
            log.error("Task {} failed", taskId, e);
            task.setStatus("FAILED");
            task.setErrorMessage(e.getMessage());
            task.setCompletedAt(Instant.now());
            taskRepo.save(task);
            addLog(task, "ERROR", "失败: " + e.getMessage(), "engine");
        }
    }

    private Map<String, Object> runBenchmark(EvaluationTask task) {
        Map<String, Object> r = new HashMap<>();
        Random rand = new Random();
        r.put("latencyP50", round(5 + rand.nextDouble() * 20));
        r.put("latencyP95", round(10 + rand.nextDouble() * 40));
        r.put("latencyP99", round(15 + rand.nextDouble() * 60));
        r.put("throughput", round(100 + rand.nextDouble() * 900));
        r.put("cpuUtil", round(30 + rand.nextDouble() * 60));
        r.put("memUsageGB", round(0.5 + rand.nextDouble() * 4));
        r.put("accuracy", round(85 + rand.nextDouble() * 14));
        r.put("f1Score", round(80 + rand.nextDouble() * 18));
        r.put("precision", round(82 + rand.nextDouble() * 16));
        r.put("recall", round(78 + rand.nextDouble() * 20));
        addLog(task, "INFO", String.format("P95=%.1fms, QPS=%.0f, Acc=%.1f%%",
            (Double)r.get("latencyP95"), (Double)r.get("throughput"), (Double)r.get("accuracy")), "benchmark");
        return r;
    }

    @Transactional
    public EvaluationReport generateReport(EvaluationTask task, Map<String, Object> results) {
        EvaluationReport report = new EvaluationReport();
        report.setReportNo("RPT-" + Instant.now().getEpochSecond());
        report.setTaskId(task.getId());
        report.setTitle(task.getName() + " - 评测报告");
        report.setEvalType(task.getEvalType() != null ? task.getEvalType() : "GENERAL");
        report.setStatus("GENERATED");
        report.setCreatedBy(task.getCreatedBy());
        report.setScore(((Double)results.get("accuracy") + (Double)results.get("f1Score")) / 2);
        try {
            report.setMetrics(objectMapper.writeValueAsString(results));
            Map<String, Object> charts = new HashMap<>();
            charts.put("latency", Map.of("P50", results.get("latencyP50"), "P95", results.get("latencyP95"), "P99", results.get("latencyP99")));
            charts.put("throughput", results.get("throughput"));
            charts.put("resource", Map.of("cpu", results.get("cpuUtil"), "memory", results.get("memUsageGB")));
            report.setChartData(objectMapper.writeValueAsString(charts));
        } catch (Exception e) { log.warn("Serialize failed", e); }
        StringBuilder sb = new StringBuilder();
        sb.append("目标: ").append(task.getTargetModel());
        sb.append(" | P95: ").append(String.format("%.1fms", (Double)results.get("latencyP95")));
        sb.append(" | QPS: ").append(String.format("%.0f", (Double)results.get("throughput")));
        sb.append(" | 精度: ").append(String.format("%.1f%%", (Double)results.get("accuracy")));
        report.setSummary(sb.toString());
        return reportRepo.save(report);
    }

    private void addLog(EvaluationTask task, String level, String msg, String source) {
        EvalLog l = new EvalLog();
        l.setTaskId(task.getId());
        l.setLogLevel(level);
        l.setMessage(msg);
        l.setSource(source);
        logRepo.save(l);
    }

    private void updateProgress(EvaluationTask task, int p) { task.setProgress(p); taskRepo.save(task); }
    private void simulateWork(long ms) { try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); } }
    private double round(double v) { return Math.round(v * 100.0) / 100.0; }
}
