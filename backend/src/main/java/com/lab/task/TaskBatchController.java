package com.lab.task;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 评测任务批量操作控制器 — 批量执行 / 批量删除 / 批量取消
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
@RequiredArgsConstructor
public class TaskBatchController {

    private final EvaluationTaskService taskService;

    /**
     * #372: 批量执行任务 — 接受 JSON body {"taskIds": [1,2,3]}
     */
    @PostMapping("/batch/execute")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> batchExecuteTasks(
            @RequestBody Map<String, List<Long>> request) {
        Long userId = EvaluationTaskController.getCurrentUserId();
        List<Long> taskIds = extractIds(request, "taskIds", "ids");
        if (taskIds == null || taskIds.isEmpty()) {
            return ResponseEntity.badRequest().body(
                    TaskResponseHelper.error(1001, "taskIds不能为空"));
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
            return ResponseEntity.ok(TaskResponseHelper.ok(Map.of("executed", executed)));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    @PostMapping("/batch/delete")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> batchDeleteTasks(
            @RequestBody Map<String, List<Long>> request) {
        Long userId = EvaluationTaskController.getCurrentUserId();
        List<Long> taskIds = extractIds(request, "ids", "taskIds");
        if (taskIds == null || taskIds.isEmpty()) {
            return ResponseEntity.badRequest().body(
                    TaskResponseHelper.error(1001, "ids不能为空"));
        }
        try {
            int deleted = taskService.batchDeleteTasks(taskIds, userId);
            return ResponseEntity.ok(TaskResponseHelper.ok(Map.of("deleted", deleted)));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    @PostMapping("/batch/cancel")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> batchCancelTasks(
            @RequestBody Map<String, List<Long>> request) {
        Long userId = EvaluationTaskController.getCurrentUserId();
        List<Long> taskIds = extractIds(request, "ids", "taskIds");
        if (taskIds == null) {
            return ResponseEntity.badRequest().body(
                    TaskResponseHelper.error(1001, "ids不能为空"));
        }
        if (taskIds.isEmpty()) {
            return ResponseEntity.badRequest().body(
                    TaskResponseHelper.error(1001, "taskIds不能为空数组"));
        }
        try {
            int cancelled = taskService.batchCancelTasks(taskIds, userId);
            return ResponseEntity.ok(TaskResponseHelper.ok(Map.of("cancelled", cancelled)));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    /** 从 request body 提取 ID 列表，尝试 primary key 再 fallback key */
    private List<Long> extractIds(Map<String, List<Long>> request, String primaryKey, String fallbackKey) {
        if (request == null) return null;
        List<Long> ids = request.get(primaryKey);
        return ids != null ? ids : request.get(fallbackKey);
    }
}
