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
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        EvaluationTask.TaskStatus taskStatus = status != null ?
                EvaluationTask.TaskStatus.valueOf(status) : null;
        Page<EvaluationTask> tasks = taskService.listTasks(userId, planId, taskStatus, pageable);
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
}
