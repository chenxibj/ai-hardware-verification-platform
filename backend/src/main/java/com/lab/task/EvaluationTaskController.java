package com.lab.task;

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

    /**
     * 创建评测任务
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createTask(
            @Valid @RequestBody CreateTaskRequest request,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        
        if (userId == null) {
            userId = 1L; // 默认使用管理员用户
        }

        EvaluationTask task = taskService.createTask(request, userId);
        
        Map<String, Object> response = new HashMap<>();
        response.put("code", 0);
        response.put("message", "success");
        response.put("data", task);
        
        return ResponseEntity.ok(response);
    }

    /**
     * 查询任务列表
     */
    @GetMapping
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

    /**
     * 查询任务详情
     */
    @GetMapping("/{taskId}")
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

    /**
     * 取消任务
     */
    @PostMapping("/{taskId}/cancel")
    public ResponseEntity<Map<String, Object>> cancelTask(
            @PathVariable Long taskId,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        
        if (userId == null) {
            userId = 1L;
        }

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

    /**
     * 重试任务
     */
    @PostMapping("/{taskId}/retry")
    public ResponseEntity<Map<String, Object>> retryTask(
            @PathVariable Long taskId,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        
        if (userId == null) {
            userId = 1L;
        }

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

    /**
     * 更新任务进度
     */
    @PostMapping("/{taskId}/progress")
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

    /**
     * 暂停任务
     */
    @PostMapping("/{taskId}/pause")
    public ResponseEntity<Map<String, Object>> pauseTask(
            @PathVariable Long taskId,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        
        if (userId == null) {
            userId = 1L;
        }

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

    /**
     * 恢复任务
     */
    @PostMapping("/{taskId}/resume")
    public ResponseEntity<Map<String, Object>> resumeTask(
            @PathVariable Long taskId,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        
        if (userId == null) {
            userId = 1L;
        }

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

}
