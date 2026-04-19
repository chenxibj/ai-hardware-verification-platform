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
import com.lab.gpu.GpuSlotService;
import com.lab.runspec.RunSpec;
import com.lab.runspec.RunSpecRepository;

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
    private final GpuSlotService gpuSlotService;
    private final RunSpecRepository runSpecRepository;

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
        // #519: Enrich RUNNING tasks with stall warnings
        for (EvaluationTask t : tasks.getContent()) { enrichWithWarning(t); }
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
                    enrichWithWarning(task);
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
            task.setLastProgressUpdateAt(java.time.Instant.now());
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
        stats.put("queued", taskRepository.countByStatus(EvaluationTask.TaskStatus.QUEUED));
        // #519: stalled count
        stats.put("stalled", taskRepository.countStalledRunningTasks(
                java.time.Instant.now().minus(5, java.time.temporal.ChronoUnit.MINUTES)));
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
     * #481: GET /tasks/queue — compute positions + wait estimates on-the-fly
     * #486: queueReason is recomputed from current GPU state (not stale persisted value)
     * Uses per-evalType average duration from last 7 days (falls back to 10 min)
     */
    @GetMapping("/queue")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getQueuedTasks() {
        List<EvaluationTask> queuedTasks = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();

        // #481: Build evalType -> avg minutes map from recent completions
        Map<String, Double> avgMinutesByType = new HashMap<>();
        try {
            List<Object[]> rawAvgs = taskRepository.findAverageDurationByEvalTypeRaw();
            for (Object[] row : rawAvgs) {
                String evalType = (String) row[0];
                double avgSec = ((Number) row[1]).doubleValue();
                avgMinutesByType.put(evalType, avgSec / 60.0);
            }
        } catch (Exception e) {
            log.debug("Failed to compute per-type avg duration: {}", e.getMessage());
        }

        // #486: Pre-fetch node GPU state for fresh queueReason computation
        // Build nodeId -> {free, total} map for all online nodes
        Map<Long, long[]> nodeGpuState = new HashMap<>();
        try {
            List<ComputeNode> allNodes = computeNodeRepository.findAll();
            for (ComputeNode node : allNodes) {
                long free = gpuSlotService.countFreeSlots(node.getId());
                long total = gpuSlotService.countTotalSlots(node.getId());
                if (total > 0) {
                    nodeGpuState.put(node.getId(), new long[]{free, total});
                }
            }
        } catch (Exception e) {
            log.debug("Failed to pre-fetch GPU state for queue reasons: {}", e.getMessage());
        }

        List<Map<String, Object>> queueData = new java.util.ArrayList<>();
        for (int i = 0; i < queuedTasks.size(); i++) {
            EvaluationTask task = queuedTasks.get(i);
            int position = i + 1;
            String evalType = task.getEvalType() != null ? task.getEvalType().name() : null;
            double avgMin = (evalType != null) ? avgMinutesByType.getOrDefault(evalType, 10.0) : 10.0;
            int estimatedWait = (int) Math.ceil(position * avgMin);

            // #486: Compute fresh queueReason from current GPU state
            String freshReason = computeFreshQueueReason(task, nodeGpuState);

            Map<String, Object> item = new java.util.LinkedHashMap<>();
            item.put("id", task.getId());
            item.put("taskNo", task.getTaskNo());
            item.put("name", task.getName());
            item.put("evalType", evalType);
            item.put("status", task.getStatus() != null ? task.getStatus().name() : null);
            item.put("priority", task.getPriority() != null ? task.getPriority().name() : null);
            item.put("queuePosition", position);
            item.put("estimatedWaitMinutes", estimatedWait);
            item.put("queueReason", freshReason != null ? freshReason : task.getQueueReason());
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

    /**
     * #486: Compute a fresh queueReason based on current GPU resource state.
     * Returns null if we can't determine a meaningful reason (caller falls back to persisted).
     */
    private String computeFreshQueueReason(EvaluationTask task, Map<Long, long[]> nodeGpuState) {
        try {
            // Resolve how many GPUs this task needs from its RunSpec
            int gpuNeeded = 1; // default
            RunSpec runSpec = resolveRunSpecForTask(task);
            if (runSpec != null && runSpec.getGpuPerNode() != null && runSpec.getGpuPerNode() > 0) {
                gpuNeeded = runSpec.getGpuPerNode();
            }

            // If task targets a specific node, check that node's GPU state
            if (task.getAssignedNodeId() != null) {
                long[] state = nodeGpuState.get(task.getAssignedNodeId());
                if (state != null) {
                    long free = state[0];
                    long total = state[1];
                    ComputeNode node = computeNodeRepository.findById(task.getAssignedNodeId()).orElse(null);
                    String nodeName = node != null ? node.getName() : "ID=" + task.getAssignedNodeId();
                    if (free < gpuNeeded) {
                        return String.format("等待 GPU 资源释放（节点 %s: %d/%d 空闲，需要 %d）",
                                nodeName, free, total, gpuNeeded);
                    } else {
                        return String.format("GPU 资源充足（节点 %s: %d/%d 空闲，需要 %d），等待调度",
                                nodeName, free, total, gpuNeeded);
                    }
                }
            }

            // No specific node — check all GPU nodes
            if (!nodeGpuState.isEmpty()) {
                // Find best node (most free GPUs)
                long bestFree = 0;
                long bestTotal = 0;
                String bestNodeName = null;
                for (Map.Entry<Long, long[]> entry : nodeGpuState.entrySet()) {
                    long free = entry.getValue()[0];
                    long total = entry.getValue()[1];
                    if (free > bestFree) {
                        bestFree = free;
                        bestTotal = total;
                        ComputeNode node = computeNodeRepository.findById(entry.getKey()).orElse(null);
                        bestNodeName = node != null ? node.getName() : "ID=" + entry.getKey();
                    }
                }
                if (bestFree < gpuNeeded) {
                    return String.format("等待 GPU 资源释放（最优节点 %s: %d/%d 空闲，需要 %d）",
                            bestNodeName, bestFree, bestTotal, gpuNeeded);
                } else {
                    return String.format("GPU 资源充足（%s: %d/%d 空闲，需要 %d），等待调度",
                            bestNodeName, bestFree, bestTotal, gpuNeeded);
                }
            }
        } catch (Exception e) {
            log.debug("Failed to compute fresh queue reason for task {}: {}", task.getTaskNo(), e.getMessage());
        }
        return null; // fall back to persisted queueReason
    }

    /**
     * #486: Resolve RunSpec for a task (simplified version of TaskDispatcher.resolveRunSpec)
     */
    private RunSpec resolveRunSpecForTask(EvaluationTask task) {
        if (task.getRunSpecId() != null) {
            return runSpecRepository.findById(task.getRunSpecId()).orElse(null);
        }
        if (task.getRunSpecCode() != null && !task.getRunSpecCode().isBlank()) {
            return runSpecRepository.findByCode(task.getRunSpecCode()).orElse(null);
        }
        return null;
    }


    /**
     * #520: GET /tasks/queue-status — queue summary with user's tasks
     */
    @GetMapping("/queue-status")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getQueueStatus() {
        Long userId = getCurrentUserId();
        List<EvaluationTask> queuedTasks = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();

        Map<String, Double> avgMinutesByType = new java.util.HashMap<>();
        try {
            List<Object[]> rawAvgs = taskRepository.findAverageDurationByEvalTypeRaw();
            for (Object[] row : rawAvgs) {
                String evalType = (String) row[0];
                double avgSec = ((Number) row[1]).doubleValue();
                avgMinutesByType.put(evalType, avgSec / 60.0);
            }
        } catch (Exception e) { log.debug("avg calc failed: {}", e.getMessage()); }

        List<Map<String, Object>> myTasks = new java.util.ArrayList<>();
        List<Map<String, Object>> allTasks = new java.util.ArrayList<>();
        for (int i = 0; i < queuedTasks.size(); i++) {
            EvaluationTask task = queuedTasks.get(i);
            int position = i + 1;
            String evalType = task.getEvalType() != null ? task.getEvalType().name() : null;
            double avgMin = (evalType != null) ? avgMinutesByType.getOrDefault(evalType, 10.0) : 10.0;
            int estimatedWait = (int) Math.ceil(position * avgMin);

            Map<String, Object> item = new java.util.LinkedHashMap<>();
            item.put("taskId", task.getId());
            item.put("taskNo", task.getTaskNo());
            item.put("name", task.getName());
            item.put("queuePosition", position);
            item.put("estimatedWaitMinutes", estimatedWait);
            item.put("priority", task.getPriority() != null ? task.getPriority().name() : null);
            item.put("createdBy", task.getCreatedBy());
            item.put("createdAt", task.getCreatedAt());
            allTasks.add(item);

            if (task.getCreatedBy() != null && task.getCreatedBy().equals(userId)) {
                myTasks.add(item);
            }
        }

        Map<String, Object> data = new java.util.LinkedHashMap<>();
        data.put("totalQueued", queuedTasks.size());
        data.put("myQueuedCount", myTasks.size());
        data.put("myQueuedTasks", myTasks);
        data.put("allQueuedTasks", allTasks);

        Map<String, Object> response = new HashMap<>();
        response.put("code", 0);
        response.put("message", "success");
        response.put("data", data);
        return ResponseEntity.ok(response);
    }

    /**
     * #520: PATCH /tasks/{taskId}/cancel — cancel QUEUED/PENDING task only
     */
    @PatchMapping("/{taskId}/cancel")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> patchCancelTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskRepository.findById(taskId)
                    .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
            if (task.getStatus() != EvaluationTask.TaskStatus.QUEUED
                    && task.getStatus() != EvaluationTask.TaskStatus.PENDING) {
                throw new RuntimeException("Only QUEUED or PENDING tasks can be cancelled via PATCH, current: " + task.getStatus());
            }
            EvaluationTask cancelled = taskService.cancelTask(taskId, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "success");
            response.put("data", cancelled);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("code", 1001);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    /**
     * #519: GET /tasks/stalled — list stalled (warning) tasks
     */
    @GetMapping("/stalled")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getStalledTasks() {
        java.time.Instant threshold = java.time.Instant.now().minus(5, java.time.temporal.ChronoUnit.MINUTES);
        List<EvaluationTask> stalledTasks = taskRepository.findStalledRunningTasks(threshold);

        for (EvaluationTask task : stalledTasks) {
            enrichWithWarning(task);
        }

        Map<String, Object> response = new HashMap<>();
        response.put("code", 0);
        response.put("message", "success");
        response.put("data", stalledTasks);
        response.put("total", stalledTasks.size());
        return ResponseEntity.ok(response);
    }

    /**
     * #519: Enrich a task with stall warning info (called for RUNNING tasks)
     */
    private void enrichWithWarning(EvaluationTask task) {
        if (task.getStatus() != EvaluationTask.TaskStatus.RUNNING) return;
        java.time.Instant threshold = java.time.Instant.now().minus(5, java.time.temporal.ChronoUnit.MINUTES);
        java.time.Instant lastUpdate = task.getLastProgressUpdateAt() != null
                ? task.getLastProgressUpdateAt()
                : task.getStartedAt();
        if (lastUpdate != null && lastUpdate.isBefore(threshold)) {
            long stallMinutes = java.time.Duration.between(lastUpdate, java.time.Instant.now()).toMinutes();
            task.setWarningMessage(String.format("任务已卡顿 %d 分钟，进度无更新", stallMinutes));
            task.setIsStalled(true);
        }
    }

}
