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

import java.util.Map;

/**
 * 评测任务日志控制器
 * Issue: #173
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
public class TaskLogController {

    private final EvaluationTaskRepository taskRepository;

    public TaskLogController(EvaluationTaskRepository taskRepository) {
        this.taskRepository = taskRepository;
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
     * 获取任务日志内容。
     * TODO: [MVP-1] 当前评测任务尚无日志存储机制（EvaluationTask 无 logPath 字段）。
     * 后续需要在评测执行流程中将真实日志写入文件/数据库，并在此处读取返回。
     */
    private String getLogContent(Long taskId) {
        EvaluationTask task = taskRepository.findById(taskId).orElse(null);
        if (task == null) {
            return "[INFO] 任务 " + taskId + " 不存在。";
        }

        String statusInfo;
        switch (task.getStatus()) {
            case PENDING:
                statusInfo = "任务等待中，日志尚未生成。";
                break;
            case QUEUED:
                statusInfo = "任务已排队，等待执行，日志尚未生成。";
                break;
            case RUNNING:
                statusInfo = "任务执行中，日志将在执行完成后生成。";
                break;
            case PAUSED:
                statusInfo = "任务已暂停，日志将在任务恢复执行后继续生成。";
                break;
            case COMPLETED:
                statusInfo = "任务已完成。日志存储功能尚未实现，暂无日志记录。";
                break;
            case FAILED:
                statusInfo = "任务执行失败。日志存储功能尚未实现，暂无日志记录。";
                break;
            case CANCELLED:
                statusInfo = "任务已取消。";
                break;
            case SKIPPED:
                statusInfo = "任务已跳过。";
                break;
            default:
                statusInfo = "日志暂未生成。";
                break;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("[INFO] 任务编号: ").append(task.getTaskNo()).append("\n");
        sb.append("[INFO] 任务名称: ").append(task.getName()).append("\n");
        sb.append("[INFO] 当前状态: ").append(task.getStatus().name()).append("\n");
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
