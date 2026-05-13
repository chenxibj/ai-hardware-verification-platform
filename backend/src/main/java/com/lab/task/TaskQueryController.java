package com.lab.task;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.node.ComputeNodeRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 评测任务查询控制器 — 列表 / 详情 / 统计 / 调试信息
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
@RequiredArgsConstructor
public class TaskQueryController {

    private final EvaluationTaskService taskService;
    private final EvaluationTaskRepository taskRepository;
    private final TaskLogRepository taskLogRepository;
    private final ComputeNodeRepository computeNodeRepository;
    private final EvaluationResultRepository evaluationResultRepository;

    @GetMapping
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> listTasks(
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) Long planId,
            @RequestParam(required = false) Long chipId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        EvaluationTask.TaskStatus taskStatus = null;
        if (status != null) {
            try {
                taskStatus = EvaluationTask.TaskStatus.valueOf(status);
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001,
                        "无效的状态值: " + status + "，有效值: PENDING, QUEUED, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED, SKIPPED"));
            }
        }
        Page<EvaluationTask> tasks = taskService.listTasks(userId, planId, chipId, taskStatus, pageable);
        // #519: Enrich RUNNING tasks with stall warnings
        for (EvaluationTask t : tasks.getContent()) { TaskWarningHelper.enrichWithWarning(t); }
        return ResponseEntity.ok(TaskResponseHelper.ok(tasks.getContent(),
                Map.of("total", tasks.getTotalElements(), "page", page, "size", size)));
    }

    @GetMapping("/{taskId}")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getTaskDetail(@PathVariable Long taskId) {
        return taskService.getTaskDetail(taskId)
                .map(task -> {
                    TaskWarningHelper.enrichWithWarning(task);
                    return ResponseEntity.ok(TaskResponseHelper.ok(task));
                })
                .orElseGet(() -> ResponseEntity.status(404).body(
                        TaskResponseHelper.error(1001, "任务不存在: " + taskId)));
    }

    @GetMapping("/stats")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getTaskStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("total", taskRepository.count());
        stats.put("pending", taskRepository.countByStatus(EvaluationTask.TaskStatus.PENDING));
        stats.put("running", taskRepository.countByStatus(EvaluationTask.TaskStatus.RUNNING));
        stats.put("completed", taskRepository.countByStatus(EvaluationTask.TaskStatus.COMPLETED));
        stats.put("failed", taskRepository.countByStatus(EvaluationTask.TaskStatus.FAILED));
        stats.put("cancelled", taskRepository.countByStatus(EvaluationTask.TaskStatus.CANCELLED));
        stats.put("queued", taskRepository.countByStatus(EvaluationTask.TaskStatus.QUEUED));
        // #519: stalled count
        stats.put("stalled", taskRepository.countStalledRunningTasks(
                Instant.now().minus(5, ChronoUnit.MINUTES)));
        return ResponseEntity.ok(TaskResponseHelper.ok(stats));
    }

    @GetMapping("/{taskId}/debug-info")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getDebugInfo(@PathVariable Long taskId) {
        try {
            EvaluationTask task = taskRepository.findById(taskId)
                    .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

            Map<String, Object> info = new HashMap<>();
            info.put("taskId", task.getId());
            info.put("taskNo", task.getTaskNo());
            info.put("taskStatus", task.getStatus() != null ? task.getStatus().name() : null);
            info.put("assignedNodeId", task.getAssignedNodeId());
            info.put("startedAt", task.getStartedAt());
            info.put("completedAt", task.getCompletedAt());
            info.put("progress", task.getProgress());
            info.put("evalConfig", task.getEvalConfig());

            if (task.getAssignedNodeId() != null) {
                computeNodeRepository.findById(task.getAssignedNodeId()).ifPresent(node -> {
                    info.put("nodeHost", node.getIpAddress());
                    info.put("nodeName", node.getName());
                    info.put("nodeStatus", node.getStatus() != null ? node.getStatus().name() : null);
                });
            }

            info.put("logPath", "/opt/ai-hardware-verification-platform/agent/logs/" + taskId + ".log");
            return ResponseEntity.ok(TaskResponseHelper.ok(info));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    @GetMapping("/{taskId}/debug-log")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getDebugLog(@PathVariable Long taskId) {
        try {
            List<TaskLog> logs = taskLogRepository.findByTaskIdOrderByCreatedAtAsc(taskId);
            StringBuilder sb = new StringBuilder();
            for (TaskLog tl : logs) {
                sb.append(String.format("[%s] [%s] %s\n",
                        tl.getCreatedAt() != null ? tl.getCreatedAt().toString() : "-",
                        tl.getLevel() != null ? tl.getLevel() : "INFO",
                        tl.getMessage() != null ? tl.getMessage() : ""));
                if (tl.getContent() != null && !tl.getContent().equals(tl.getMessage())) {
                    sb.append(tl.getContent()).append("\n");
                }
            }

            Map<String, Object> data = new HashMap<>();
            data.put("content", sb.toString());
            data.put("lineCount", logs.size());
            return ResponseEntity.ok(TaskResponseHelper.ok(data));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    /**
     * GET /tasks/{taskId}/results — #362: 获取任务的评测结果
     */
    @GetMapping("/{taskId}/results")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getTaskResults(@PathVariable Long taskId) {
        java.util.Optional<EvaluationTask> taskOpt = taskRepository.findById(taskId);
        if (taskOpt.isEmpty()) {
            return ResponseEntity.status(404).body(
                    TaskResponseHelper.error(1001, "任务不存在: " + taskId));
        }
        java.util.Optional<EvaluationResult> resultOpt = evaluationResultRepository.findByTaskId(taskId);
        Object data = resultOpt.isPresent() ? java.util.List.of(resultOpt.get()) : java.util.List.of();
        return ResponseEntity.ok(TaskResponseHelper.ok(data));
    }
}
