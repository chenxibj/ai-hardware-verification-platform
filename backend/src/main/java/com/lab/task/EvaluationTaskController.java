package com.lab.task;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import java.util.List;
import java.util.HashMap;
import java.util.Map;

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

    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> createTask(
            @Valid @RequestBody CreateTaskRequest request,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
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
        EvaluationTask.TaskStatus taskStatus = status != null ?
                EvaluationTask.TaskStatus.valueOf(status) : null;
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
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{taskId}/cancel")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> cancelTask(
            @PathVariable Long taskId,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
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
    public ResponseEntity<Map<String, Object>> retryTask(
            @PathVariable Long taskId,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
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
    public ResponseEntity<Map<String, Object>> pauseTask(
            @PathVariable Long taskId,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
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
    public ResponseEntity<Map<String, Object>> resumeTask(
            @PathVariable Long taskId,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
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
    public ResponseEntity<Map<String, Object>> skipTask(
            @PathVariable Long taskId,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
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

    /**
     * POST /tasks/{taskId}/clone — 克隆任务 (#227)
     */
    @PostMapping("/{taskId}/clone")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> cloneTask(
            @PathVariable Long taskId,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
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

    /**
     * GET /tasks/stats — 任务统计 (#227)
     */
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

    /**
     * GET /tasks/{taskId}/debug-info — \u8c03\u8bd5\u4fe1\u606f (#228)
     */
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

            // \u83b7\u53d6\u8282\u70b9\u4fe1\u606f
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

    /**
     * GET /tasks/{taskId}/debug-log — \u8c03\u8bd5\u65e5\u5fd7 (#228)
     */
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



}