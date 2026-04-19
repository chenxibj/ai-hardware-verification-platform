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
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/**
 * 任务完成回调控制器（已废弃）
 * POST /api/tasks/{taskId}/complete — Agent 回报任务结果
 * Issue: #135
 *
 * @deprecated #523: This controller has a bug that stores metricsSummary as rawData.
 *             Use POST /api/tasks/{id}/result (EvaluationResultController) instead.
 *             Set ahvp.deprecated.complete-endpoint.return-gone=true to return 410 Gone.
 */
@Deprecated
@Slf4j
@RestController
@RequestMapping("/tasks")
public class TaskCompleteController {

    private static final String DEPRECATION_WARNING =
            "299 - \"Deprecated: use POST /api/tasks/{id}/result instead\"";

    private final EvaluationTaskRepository taskRepository;
    private final EvaluationResultRepository resultRepository;
    private final EvaluationPlanRepository planRepository;
    private final com.lab.chipreport.ReportGeneratorService reportGeneratorService;
    private final TaskLogRepository taskLogRepository;
    private final ObjectMapper objectMapper;
    private final ComputeNodeRepository nodeRepository;
    private final com.lab.gpu.GpuSlotService gpuSlotService;

    /**
     * #523: Feature flag — when true, this endpoint returns 410 Gone immediately.
     * Default: false (still processes requests but with deprecation warning).
     */
    private final boolean returnGone;

    public TaskCompleteController(
            EvaluationTaskRepository taskRepository,
            EvaluationResultRepository resultRepository,
            EvaluationPlanRepository planRepository,
            com.lab.chipreport.ReportGeneratorService reportGeneratorService,
            TaskLogRepository taskLogRepository,
            ObjectMapper objectMapper,
            ComputeNodeRepository nodeRepository,
            com.lab.gpu.GpuSlotService gpuSlotService,
            @Value("${ahvp.deprecated.complete-endpoint.return-gone:false}") boolean returnGone) {
        this.taskRepository = taskRepository;
        this.resultRepository = resultRepository;
        this.planRepository = planRepository;
        this.reportGeneratorService = reportGeneratorService;
        this.taskLogRepository = taskLogRepository;
        this.objectMapper = objectMapper;
        this.nodeRepository = nodeRepository;
        this.gpuSlotService = gpuSlotService;
        this.returnGone = returnGone;
    }

    @PostMapping("/{taskId}/complete")
    @Transactional
    @Deprecated
    public ResponseEntity<Map<String, Object>> completeTask(
            @PathVariable Long taskId,
            @RequestBody TaskCompleteRequest request) {

        log.warn("#523: Deprecated endpoint called: POST /tasks/{}/complete. Use POST /tasks/{}/result instead.", taskId, taskId);

        // #523: Feature flag — return 410 Gone when enabled
        if (returnGone) {
            log.info("#523: Returning 410 Gone for deprecated endpoint (feature flag enabled)");
            Map<String, Object> gone = new HashMap<>();
            gone.put("code", 410);
            gone.put("message", "Gone: this endpoint is deprecated. Use POST /api/tasks/{id}/result instead.");
            HttpHeaders headers = new HttpHeaders();
            headers.add("Warning", DEPRECATION_WARNING);
            return ResponseEntity.status(HttpStatus.GONE).headers(headers).body(gone);
        }

        // 1. Find task
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

        // 2. Build metricsSummary JSON
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

        // 3. Create EvaluationResult
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

        // 4. Update Task status
        boolean passed = request.getPassed() != null && request.getPassed();
        task.setStatus(passed ? EvaluationTask.TaskStatus.COMPLETED : EvaluationTask.TaskStatus.FAILED);
        task.setCompletedAt(Instant.now());
        task.setProgress(100);
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

        try {
            gpuSlotService.releaseGpuSlots(taskId);
            log.info("#403: Released GPU slots for completed task {}", taskId);
        } catch (Exception e) {
            log.warn("#403: Failed to release GPU slots for task {}: {}", taskId, e.getMessage());
        }

        // Write execution log
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

        // 5. Update Plan progress
        Map<String, Object> responseData = new LinkedHashMap<>();
        responseData.put("taskId", taskId);
        responseData.put("status", task.getStatus().name());

        if (task.getPlanId() != null) {
            EvaluationPlan plan = planRepository.findById(task.getPlanId()).orElse(null);
            if (plan != null) {
                List<EvaluationTask> planTasks = taskRepository.findByPlanId(plan.getId());
                long completedCount = planTasks.stream()
                        .filter(t -> t.getStatus() == EvaluationTask.TaskStatus.COMPLETED
                                || t.getStatus() == EvaluationTask.TaskStatus.FAILED
                                || t.getStatus() == EvaluationTask.TaskStatus.CANCELLED
                                || t.getStatus() == EvaluationTask.TaskStatus.SKIPPED)
                        .count();

                plan.setCompletedTasks((int) completedCount);
                int total = plan.getTotalTasks() != null && plan.getTotalTasks() > 0
                        ? plan.getTotalTasks() : planTasks.size();
                plan.setProgress(total > 0 ? (int) (completedCount * 100 / total) : 0);

                responseData.put("planProgress", plan.getProgress());
                responseData.put("completedTasks", plan.getCompletedTasks());
                responseData.put("totalTasks", total);

                boolean allDone = completedCount >= total;
                if (allDone) {
                    plan.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
                    plan.setCompletedAt(Instant.now());
                    plan.setProgress(100);
                    planRepository.save(plan);

                    log.info("Evaluation task {} all sub-tasks done, generating report...", plan.getPlanNo());

                    try {
                        var report = reportGeneratorService.generateReport(plan.getId());
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

        // #523: Add deprecation warning header
        HttpHeaders headers = new HttpHeaders();
        headers.add("Warning", DEPRECATION_WARNING);
        return ResponseEntity.ok().headers(headers).body(resp);
    }
}
