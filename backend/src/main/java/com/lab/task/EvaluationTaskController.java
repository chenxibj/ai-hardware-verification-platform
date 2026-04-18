package com.lab.task;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;

/**
 * 评测任务控制器
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
@RequiredArgsConstructor
public class EvaluationTaskController {

    private final EvaluationTaskService taskService;
    private final EvaluationTaskRepository taskRepository;
    private final TaskLogRepository taskLogRepository;
    private final ComputeNodeRepository computeNodeRepository;
    private final EvaluationResultRepository evaluationResultRepository;

    /**
     * #366: 从 SecurityContext 获取当前用户 ID，而非依赖 X-User-Id header
     */
    private Long getCurrentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof User user) {
            return user.getId();
        }
        return 1L; // fallback for agent tokens etc.
    }

    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> createTask(
            @Valid @RequestBody CreateTaskRequest request) {
        Long userId = getCurrentUserId();
        EvaluationTask task = taskService.createTask(request, userId);
        Map<String, Object> response = new HashMap<>();
        response.put("code", 0);
        response.put("message", "success");
        response.put("data", task);
        return ResponseEntity.ok(response);
    }

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
                Map<String, Object> response = new HashMap<>();
                response.put("code", 1001);
                response.put("message", "无效的状态值: " + status + "，有效值: PENDING, QUEUED, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED, SKIPPED");
                return ResponseEntity.badRequest().body(response);
            }
        }
        Page<EvaluationTask> tasks = taskService.listTasks(userId, planId, chipId, taskStatus, pageable);
        Map<String, Object> response = new HashMap<>();
        response.put("code", 0);
        response.put("message", "success");
        response.put("data", tasks.getContent());
        response.put("total", tasks.getTotalElements());
        response.put("page", page);
        response.put("size", size);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{taskId}")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getTaskDetail(@PathVariable Long taskId) {
        return taskService.getTaskDetail(taskId)
                .map(task -> {
                    Map<String, Object> response = new HashMap<>();
                    response.put("code", 0);
                    response.put("message", "success");
                    response.put("data", task);
                    return ResponseEntity.ok(response);
                })
                .orElseGet(() -> {
                    Map<String, Object> response = new HashMap<>();
                    response.put("code", 1001);
                    response.put("message", "任务不存在: " + taskId);
                    return ResponseEntity.status(404).body(response);
                });
    }

    /**
     * #368: POST /tasks/{taskId}/start — 启动任务
     */
    @PostMapping("/{taskId}/start")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> startTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.executeTask(taskId, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", task);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/{taskId}/cancel")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> cancelTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.cancelTask(taskId, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", task);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/{taskId}/retry")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> retryTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.retryTask(taskId, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", task);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/{taskId}/progress")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> updateProgress(
            @PathVariable Long taskId,
            @RequestParam int progress) {
        try {
            EvaluationTask task = taskService.getTaskDetail(taskId)
                    .orElseThrow(() -> new RuntimeException("Task not found"));
            task.setProgress(progress);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", task);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/{taskId}/pause")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> pauseTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.pauseTask(taskId, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", task);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/{taskId}/resume")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> resumeTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.resumeTask(taskId, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", task);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/{taskId}/skip")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> skipTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.skipTask(taskId, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", task);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/{taskId}/clone")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> cloneTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask cloned = taskService.cloneTask(taskId, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", cloned);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
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
        Map<String, Object> response = new HashMap<>();
        response.put("code", 0);
        response.put("message", "success");
        response.put("data", stats);
        return ResponseEntity.ok(response);
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

            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", info);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @GetMapping("/{taskId}/debug-log")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getDebugLog(@PathVariable Long taskId) {
        try {
            List<TaskLog> logs = taskLogRepository.findByTaskIdOrderByCreatedAtAsc(taskId);
            StringBuilder sb = new StringBuilder();
            for (TaskLog log : logs) {
                sb.append(String.format("[%s] [%s] %s\n",
                        log.getCreatedAt() != null ? log.getCreatedAt().toString() : "-",
                        log.getLevel() != null ? log.getLevel() : "INFO",
                        log.getMessage() != null ? log.getMessage() : ""));
                if (log.getContent() != null && !log.getContent().equals(log.getMessage())) {
                    sb.append(log.getContent()).append("\n");
                }
            }

            Map<String, Object> data = new HashMap<>();
            data.put("content", sb.toString());
            data.put("lineCount", logs.size());

            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", data);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @DeleteMapping("/{taskId}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> deleteTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            taskService.deleteTask(taskId, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/{taskId}/execute")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> executeTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.executeTask(taskId, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", task);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }


    /**
     * #372: 批量执行任务 — 接受 JSON body {"taskIds": [1,2,3]}
     */
    @PostMapping("/batch/execute")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> batchExecuteTasks(
            @RequestBody Map<String, List<Long>> request) {
        Long userId = getCurrentUserId();
        List<Long> taskIds = null;
        if (request != null) {
            taskIds = request.get("taskIds");
            if (taskIds == null) taskIds = request.get("ids");
        }
        if (taskIds == null || taskIds.isEmpty()) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", "taskIds不能为空");
            return ResponseEntity.badRequest().body(response);
        }
        try {
            int executed = 0;
            for (Long taskId : taskIds) {
                try {
                    taskService.executeTask(taskId, userId);
                    executed++;
                } catch (Exception e) {
                    log.warn("Failed to execute task {}: {}", taskId, e.getMessage());
                }
            }
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", Map.of("executed", executed));
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/batch/delete")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> batchDeleteTasks(
            @RequestBody Map<String, List<Long>> request) {
        Long userId = getCurrentUserId();
        List<Long> taskIds = null;
        if (request != null) {
            taskIds = request.get("ids");
            if (taskIds == null) taskIds = request.get("taskIds");
        }
        if (taskIds == null || taskIds.isEmpty()) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", "ids不能为空");
            return ResponseEntity.badRequest().body(response);
        }
        try {
            int deleted = taskService.batchDeleteTasks(taskIds, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", Map.of("deleted", deleted));
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/batch/cancel")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> batchCancelTasks(
            @RequestBody Map<String, List<Long>> request) {
        Long userId = getCurrentUserId();
        List<Long> taskIds = null;
        if (request != null) {
            taskIds = request.get("ids");
            if (taskIds == null) taskIds = request.get("taskIds");
        }
        if (taskIds == null) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", "ids不能为空");
            return ResponseEntity.badRequest().body(response);
        }
        if (taskIds.isEmpty()) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", "taskIds不能为空数组");
            return ResponseEntity.badRequest().body(response);
        }
        try {
            int cancelled = taskService.batchCancelTasks(taskIds, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", Map.of("cancelled", cancelled));
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
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
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", "任务不存在: " + taskId);
            return ResponseEntity.status(404).body(response);
        }
        java.util.Optional<EvaluationResult> resultOpt = evaluationResultRepository.findByTaskId(taskId);
        Map<String, Object> response = new HashMap<>();
        response.put("code", 0);
        response.put("message", "success");
        if (resultOpt.isPresent()) {
            response.put("data", java.util.List.of(resultOpt.get()));
        } else {
            response.put("data", java.util.List.of());
        }
        return ResponseEntity.ok(response);
    }

    /**
     * PATCH /tasks/{taskId} — #363: 部分更新任务
     */
    @PatchMapping("/{taskId}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> patchTask(
            @PathVariable Long taskId,
            @RequestBody Map<String, Object> updates) {
        try {
            EvaluationTask task = taskRepository.findById(taskId)
                    .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

            if (updates.containsKey("name") && updates.get("name") != null) {
                task.setName(com.lab.common.XssUtils.stripXss(updates.get("name").toString()));
            }
            if (updates.containsKey("priority") && updates.get("priority") != null) {
                try {
                    task.setPriority(EvaluationTask.Priority.valueOf(updates.get("priority").toString()));
                } catch (IllegalArgumentException e) {
                    Map<String, Object> resp = new HashMap<>();
                    resp.put("code", 1001);
                    resp.put("message", "无效的优先级: " + updates.get("priority"));
                    return ResponseEntity.badRequest().body(resp);
                }
            }
            if (updates.containsKey("evalConfig") && updates.get("evalConfig") != null) {
                task.setEvalConfig(updates.get("evalConfig").toString());
            }
            if (updates.containsKey("status") && updates.get("status") != null) {
                try {
                    EvaluationTask.TaskStatus newStatus = EvaluationTask.TaskStatus.valueOf(updates.get("status").toString());
                    task.setStatus(newStatus);
                } catch (IllegalArgumentException e) {
                    Map<String, Object> resp = new HashMap<>();
                    resp.put("code", 1001);
                    resp.put("message", "无效的状态: " + updates.get("status"));
                    return ResponseEntity.badRequest().body(resp);
                }
            }
            if (updates.containsKey("progress") && updates.get("progress") != null) {
                task.setProgress(Integer.parseInt(updates.get("progress").toString()));
            }
            if (updates.containsKey("timeoutSeconds") && updates.get("timeoutSeconds") != null) {
                task.setTimeoutSeconds(Integer.parseInt(updates.get("timeoutSeconds").toString()));
            }
            if (updates.containsKey("assignedNodeId") && updates.get("assignedNodeId") != null) {
                task.setAssignedNodeId(Long.parseLong(updates.get("assignedNodeId").toString()));
            }

            EvaluationTask saved = taskRepository.save(task);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", saved);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to patch task {}", taskId, e);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }


    /**
     * #401: GET /tasks/queue-info
     */
    @GetMapping("/queue-info")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getQueueInfo() {
        List<EvaluationTask> queuedTasks = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();
        
        List<EvaluationTask> recentCompleted = taskRepository.findByStatus(EvaluationTask.TaskStatus.COMPLETED);
        long avgDurationMs = 0;
        if (!recentCompleted.isEmpty()) {
            long totalMs = 0;
            int count = 0;
            for (EvaluationTask t : recentCompleted) {
                if (t.getStartedAt() != null && t.getCompletedAt() != null) {
                    totalMs += java.time.Duration.between(t.getStartedAt(), t.getCompletedAt()).toMillis();
                    count++;
                    if (count >= 20) break;
                }
            }
            if (count > 0) avgDurationMs = totalMs / count;
        }
        
        long runningCount = taskRepository.countByStatus(EvaluationTask.TaskStatus.RUNNING);
        int concurrency = Math.max(1, (int) runningCount);
        
        List<Map<String, Object>> queueInfo = new java.util.ArrayList<>();
        for (int i = 0; i < queuedTasks.size(); i++) {
            EvaluationTask task = queuedTasks.get(i);
            Map<String, Object> info = new java.util.LinkedHashMap<>();
            info.put("taskId", task.getId());
            info.put("taskNo", task.getTaskNo());
            info.put("position", i + 1);
            info.put("totalQueued", queuedTasks.size());
            info.put("queueReason", task.getQueueReason());
            if (avgDurationMs > 0 && concurrency > 0) {
                long estimatedWaitMs = ((long)(i + 1) / concurrency) * avgDurationMs;
                info.put("estimatedWaitMs", estimatedWaitMs);
                info.put("estimatedWaitMinutes", estimatedWaitMs / 60000);
            }
            queueInfo.add(info);
        }
        
        Map<String, Object> response = new HashMap<>();
        response.put("code", 0);
        response.put("message", "success");
        response.put("data", queueInfo);
        return ResponseEntity.ok(response);
    }


    /**
     * #478 P6: GET /tasks/queue — 返回 QUEUED 任务列表（含 queuePosition, estimatedWaitMinutes, queueReason）
     */
    @GetMapping("/queue")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getQueuedTasks() {
        List<EvaluationTask> queuedTasks = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();

        List<Map<String, Object>> queueData = new java.util.ArrayList<>();
        for (EvaluationTask task : queuedTasks) {
            Map<String, Object> item = new java.util.LinkedHashMap<>();
            item.put("id", task.getId());
            item.put("taskNo", task.getTaskNo());
            item.put("name", task.getName());
            item.put("status", task.getStatus() != null ? task.getStatus().name() : null);
            item.put("priority", task.getPriority() != null ? task.getPriority().name() : null);
            item.put("queuePosition", task.getQueuePosition());
            item.put("estimatedWaitMinutes", task.getEstimatedWaitMinutes());
            item.put("queueReason", task.getQueueReason());
            item.put("allocatedGpuIndices", task.getAllocatedGpuIndices());
            item.put("createdAt", task.getCreatedAt());
            queueData.add(item);
        }

        Map<String, Object> response = new HashMap<>();
        response.put("code", 0);
        response.put("message", "success");
        response.put("data", queueData);
        response.put("total", queueData.size());
        return ResponseEntity.ok(response);
    }

}
