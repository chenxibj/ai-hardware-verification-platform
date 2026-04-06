package com.lab.log;

import com.lab.common.ApiResponse;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 评测任务执行日志控制器
 * Issue: #173
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
public class TaskLogController {

    private final EvaluationTaskRepository taskRepository;
    private final TaskLogRepository taskLogRepository;

    public TaskLogController(EvaluationTaskRepository taskRepository, TaskLogRepository taskLogRepository) {
        this.taskRepository = taskRepository;
        this.taskLogRepository = taskLogRepository;
    }

    /**
     * 获取任务日志内容
     */
    @GetMapping("/{taskId}/logs")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getTaskLogs(@PathVariable Long taskId) {
        String logContent = getLogContent(taskId);
        Map<String, Object> data = Map.of(
                "taskId", taskId,
                "content", logContent,
                "lineCount", logContent.split("\n").length,
                "generatedAt", System.currentTimeMillis()
        );
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    /**
     * 下载日志文件
     */
    @GetMapping("/{taskId}/logs/download")
    public ResponseEntity<Resource> downloadLogs(@PathVariable Long taskId) {
        String logContent = getLogContent(taskId);
        ByteArrayResource resource = new ByteArrayResource(logContent.getBytes());
        String filename = "task-" + taskId + "-log.txt";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + filename)
                .contentType(MediaType.TEXT_PLAIN)
                .body(resource);
    }

    /**
     * 从 task_logs 表读取真实日志，如果没有则生成状态摘要
     */
    private String getLogContent(Long taskId) {
        EvaluationTask task = taskRepository.findById(taskId).orElse(null);
        if (task == null) {
            return "[ERROR] Task " + taskId + " not found.";
        }

        List<TaskLog> logs = taskLogRepository.findByTaskIdOrderByCreatedAtAsc(taskId);

        if (!logs.isEmpty()) {
            // 返回真实日志
            StringBuilder sb = new StringBuilder();
            for (TaskLog entry : logs) {
                sb.append("[").append(entry.getLevel()).append("] ");
                if (entry.getCreatedAt() != null) {
                    sb.append(entry.getCreatedAt()).append(" ");
                }
                sb.append(entry.getMessage()).append("\n");
            }
            return sb.toString();
        }

        // 无日志记录时返回状态摘要
        StringBuilder sb = new StringBuilder();
        sb.append("[INFO] 任务编号: ").append(task.getTaskNo()).append("\n");
        sb.append("[INFO] 任务名称: ").append(task.getName()).append("\n");
        sb.append("[INFO] 当前状态: ").append(task.getStatus().name()).append("\n");

        String statusInfo;
        switch (task.getStatus()) {
            case PENDING: statusInfo = "任务等待中，日志尚未生成。"; break;
            case QUEUED: statusInfo = "任务已排队，等待执行。"; break;
            case RUNNING: statusInfo = "任务执行中。"; break;
            case PAUSED: statusInfo = "任务已暂停。"; break;
            case COMPLETED: statusInfo = "任务已完成。"; break;
            case FAILED: statusInfo = "任务执行失败。"; break;
            case CANCELLED: statusInfo = "任务已取消。"; break;
            case SKIPPED: statusInfo = "任务已跳过。"; break;
            default: statusInfo = "日志暂未生成。"; break;
        }
        sb.append("[INFO] ").append(statusInfo).append("\n");

        if (task.getStartedAt() != null) {
            sb.append("[INFO] 开始时间: ").append(task.getStartedAt()).append("\n");
        }
        if (task.getCompletedAt() != null) {
            sb.append("[INFO] 完成时间: ").append(task.getCompletedAt()).append("\n");
        }

        return sb.toString();
    }
}
