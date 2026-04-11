package com.lab.scoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.task.TaskLog;
import com.lab.task.TaskLogRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/**
 * 任务完成回调控制器
 * POST /api/tasks/{taskId}/complete — Agent 回报任务结果
 * Issue: #135
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
@RequiredArgsConstructor
public class TaskCompleteController {

    private final EvaluationTaskRepository taskRepository;
    private final EvaluationResultRepository resultRepository;
    private final EvaluationPlanRepository planRepository;
    private final ReportGenerator reportGenerator;
    private final TaskLogRepository taskLogRepository;
    private final ObjectMapper objectMapper;
    private final ComputeNodeRepository nodeRepository;

    @PostMapping("/{taskId}/complete")
    @Transactional
    public ResponseEntity<Map<String, Object>> completeTask(
            @PathVariable Long taskId,
            @RequestBody TaskCompleteRequest request) {

        log.info("Task complete callback: taskId={}, passed={}", taskId, request.getPassed());

        // 1. 查找任务
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

        // 2. 构建 metricsSummary JSON
        Map<String, Object> metrics = new LinkedHashMap<>();
        if (request.getLatencyMean() != null) metrics.put("latencyMean", request.getLatencyMean());
        if (request.getLatencyP50() != null) metrics.put("latencyP50", request.getLatencyP50());
        if (request.getLatencyP95() != null) metrics.put("latencyP95", request.getLatencyP95());
        if (request.getLatencyP99() != null) metrics.put("latencyP99", request.getLatencyP99());
        if (request.getThroughput() != null) metrics.put("throughput", request.getThroughput());
        if (request.getCpuUtil() != null) metrics.put("cpuUtil", request.getCpuUtil());
        if (request.getMemoryUsed() != null) metrics.put("memoryUsed", request.getMemoryUsed());

        String metricsSummary;
        try {
            metricsSummary = objectMapper.writeValueAsString(metrics);
        } catch (Exception e) {
            metricsSummary = "{}";
        }

        // 3. 创建 EvaluationResult
        // #361: Defensive planId/chipId resolution
        Long planId = task.getPlanId();
        Long chipId = task.getChipId();
        if (chipId == null && planId != null) {
            EvaluationPlan planForChip = planRepository.findById(planId).orElse(null);
            if (planForChip != null) {
                chipId = planForChip.getChipId();
                log.info("Task {} chipId was null, resolved from plan: {}", taskId, chipId);
            }
        }

        EvaluationResult result = new EvaluationResult();
        result.setTaskId(taskId);
        result.setPlanId(planId);
        result.setChipId(chipId);
        result.setPassed(request.getPassed() != null ? request.getPassed() : false);
        result.setMetricsSummary(metricsSummary);
        result.setRawData(metricsSummary);
        result.setErrorMessage(request.getErrorMessage());
        resultRepository.save(result);

        // 4. 更新 Task 状态
        boolean passed = request.getPassed() != null && request.getPassed();
        task.setStatus(passed ? EvaluationTask.TaskStatus.COMPLETED : EvaluationTask.TaskStatus.FAILED);
        task.setCompletedAt(Instant.now());
        task.setProgress(100);
        // #222: 释放节点，让 recovery scheduler 可以分发新任务
        if (task.getAssignedNodeId() != null) {
            nodeRepository.findById(task.getAssignedNodeId()).ifPresent(node -> {
                if (node.getStatus() == ComputeNode.Status.BUSY) {
                    node.setStatus(ComputeNode.Status.ONLINE);
                    nodeRepository.save(node);
                    log.info("Node {} released after task {} completed", node.getName(), taskId);
                }
            });
        }
        taskRepository.save(task);

        // 4.5 写入执行日志
        try {
            String logMsg = String.format("任务执行完成 - %s | passed=%s | latencyMean=%s | throughput=%s",
                    task.getName(),
                    passed,
                    request.getLatencyMean() != null ? request.getLatencyMean() + "ms" : "N/A",
                    request.getThroughput() != null ? String.valueOf(request.getThroughput()) : "N/A");
            taskLogRepository.save(new TaskLog(taskId, "INFO", logMsg, metricsSummary));
        } catch (Exception e) {
            log.warn("Failed to write task log for task {}: {}", taskId, e.getMessage());
        }

        // 5. 更新 Plan 进度
        Map<String, Object> responseData = new LinkedHashMap<>();
        responseData.put("taskId", taskId);
        responseData.put("status", task.getStatus().name());

        if (task.getPlanId() != null) {
            EvaluationPlan plan = planRepository.findById(task.getPlanId()).orElse(null);
            if (plan != null) {
                List<EvaluationTask> planTasks = taskRepository.findByPlanId(plan.getId());
                long completedCount = planTasks.stream()
                        .filter(t -> t.getStatus() == EvaluationTask.TaskStatus.COMPLETED
                                || t.getStatus() == EvaluationTask.TaskStatus.FAILED)
                        .count();

                plan.setCompletedTasks((int) completedCount);
                int total = plan.getTotalTasks() != null && plan.getTotalTasks() > 0
                        ? plan.getTotalTasks() : planTasks.size();
                plan.setProgress(total > 0 ? (int) (completedCount * 100 / total) : 0);

                responseData.put("planProgress", plan.getProgress());
                responseData.put("completedTasks", plan.getCompletedTasks());
                responseData.put("totalTasks", total);

                // 6. 检查是否所有任务都完成
                boolean allDone = completedCount >= total;
                if (allDone) {
                    plan.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
                    plan.setCompletedAt(Instant.now());
                    plan.setProgress(100);
                    planRepository.save(plan);

                    log.info("Evaluation task {} all sub-tasks done, generating report...", plan.getPlanNo());

                    // 自动生成报告
                    try {
                        var report = reportGenerator.generateReport(plan.getId());
                        responseData.put("reportGenerated", true);
                        responseData.put("reportId", report.getId());
                        responseData.put("reportNo", report.getReportNo());
                        responseData.put("overallScore", report.getOverallScore());
                    } catch (Exception e) {
                        log.error("Failed to generate report for evaluation task {}: {}", plan.getId(), e.getMessage(), e);
                        responseData.put("reportGenerated", false);
                        responseData.put("reportError", e.getMessage());
                    }
                } else {
                    planRepository.save(plan);
                    responseData.put("reportGenerated", false);
                }
            }
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 0);
        resp.put("message", "success");
        resp.put("data", responseData);
        return ResponseEntity.ok(resp);
    }
}
