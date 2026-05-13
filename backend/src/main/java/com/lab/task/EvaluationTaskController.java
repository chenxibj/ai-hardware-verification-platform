package com.lab.task;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.XssUtils;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.Map;

/**
 * 评测任务控制器 — 任务生命周期操作（创建/启动/取消/暂停/恢复/跳过/克隆/重试/删除/执行/进度/PATCH）
 *
 * 拆分自原 936 行单文件，职责按领域划分：
 * - EvaluationTaskController  → 任务生命周期（本文件）
 * - TaskQueryController       → 查询 / 统计 / 调试
 * - TaskQueueController       → 队列信息 / 排队状态
 * - TaskBatchController       → 批量操作
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
@RequiredArgsConstructor
public class EvaluationTaskController {

    private final EvaluationTaskService taskService;
    private final EvaluationTaskRepository taskRepository;

    // ── 公共工具方法（package-private，供拆分后的兄弟 Controller 复用） ──

    /**
     * #366: 从 SecurityContext 获取当前用户 ID，而非依赖 X-User-Id header
     */
    static Long getCurrentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof User user) {
            return user.getId();
        }
        return 1L; // fallback for agent tokens etc.
    }

    // ── 任务创建 ──

    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> createTask(
            @Valid @RequestBody CreateTaskRequest request) {
        Long userId = getCurrentUserId();
        EvaluationTask task = taskService.createTask(request, userId);
        return ResponseEntity.ok(TaskResponseHelper.ok(task));
    }

    // ── 单任务生命周期操作 ──

    @PostMapping("/{taskId}/start")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> startTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.executeTask(taskId, userId);
            return ResponseEntity.ok(TaskResponseHelper.ok(task));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    @PostMapping("/{taskId}/cancel")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> cancelTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.cancelTask(taskId, userId);
            return ResponseEntity.ok(TaskResponseHelper.ok(task));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    @PostMapping("/{taskId}/retry")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> retryTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.retryTask(taskId, userId);
            return ResponseEntity.ok(TaskResponseHelper.ok(task));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    @PostMapping("/{taskId}/pause")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> pauseTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.pauseTask(taskId, userId);
            return ResponseEntity.ok(TaskResponseHelper.ok(task));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    @PostMapping("/{taskId}/resume")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> resumeTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.resumeTask(taskId, userId);
            return ResponseEntity.ok(TaskResponseHelper.ok(task));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    @PostMapping("/{taskId}/skip")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> skipTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.skipTask(taskId, userId);
            return ResponseEntity.ok(TaskResponseHelper.ok(task));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    @PostMapping("/{taskId}/clone")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> cloneTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask cloned = taskService.cloneTask(taskId, userId);
            return ResponseEntity.ok(TaskResponseHelper.ok(cloned));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    @PostMapping("/{taskId}/execute")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> executeTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            EvaluationTask task = taskService.executeTask(taskId, userId);
            return ResponseEntity.ok(TaskResponseHelper.ok(task));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
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
            return ResponseEntity.ok(TaskResponseHelper.ok(task));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    @DeleteMapping("/{taskId}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> deleteTask(@PathVariable Long taskId) {
        Long userId = getCurrentUserId();
        try {
            taskService.deleteTask(taskId, userId);
            return ResponseEntity.ok(TaskResponseHelper.ok());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
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
                task.setName(XssUtils.stripXss(updates.get("name").toString()));
            }
            if (updates.containsKey("priority") && updates.get("priority") != null) {
                try {
                    task.setPriority(EvaluationTask.Priority.valueOf(updates.get("priority").toString()));
                } catch (IllegalArgumentException e) {
                    return ResponseEntity.badRequest().body(
                            TaskResponseHelper.error(1001, "无效的优先级: " + updates.get("priority")));
                }
            }
            if (updates.containsKey("evalConfig") && updates.get("evalConfig") != null) {
                task.setEvalConfig(updates.get("evalConfig").toString());
            }
            if (updates.containsKey("status") && updates.get("status") != null) {
                try {
                    task.setStatus(EvaluationTask.TaskStatus.valueOf(updates.get("status").toString()));
                } catch (IllegalArgumentException e) {
                    return ResponseEntity.badRequest().body(
                            TaskResponseHelper.error(1001, "无效的状态: " + updates.get("status")));
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
            return ResponseEntity.ok(TaskResponseHelper.ok(saved));
        } catch (Exception e) {
            log.error("Failed to patch task {}", taskId, e);
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }
}
