package com.lab.task;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 任务实时日志控制器
 * #225 - Agent 上报日志 + 前端轮询查看
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
@RequiredArgsConstructor
public class TaskLogController {

    private final TaskLogRepository taskLogRepository;

    /**
     * Agent POST /api/tasks/{taskId}/logs — 上报执行日志
     * permitAll (已在 SecurityConfig 中配置)
     */
    @PostMapping("/{taskId}/logs")
    public ResponseEntity<Map<String, Object>> appendLogs(
            @PathVariable Long taskId,
            @RequestBody Map<String, String> body) {
        String content = body.getOrDefault("content", "");
        if (content.isEmpty()) {
            return ResponseEntity.ok(result(0, "empty content, skipped"));
        }

        TaskLog logEntry = new TaskLog();
        logEntry.setTaskId(taskId);
        logEntry.setContent(content);
        taskLogRepository.save(logEntry);

        log.debug("Received {} chars of logs for task {}", content.length(), taskId);
        return ResponseEntity.ok(result(0, "ok"));
    }

    /**
     * GET /api/tasks/{taskId}/logs — 获取任务执行日志
     * permitAll
     */
    @GetMapping("/{taskId}/logs")
    public ResponseEntity<Map<String, Object>> getLogs(@PathVariable Long taskId) {
        List<TaskLog> logs = taskLogRepository.findByTaskIdOrderByCreatedAtAsc(taskId);
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 0);
        resp.put("message", "success");
        resp.put("data", logs);
        resp.put("total", logs.size());
        return ResponseEntity.ok(resp);
    }

    /**
     * GET /api/tasks/{taskId}/logs/download — 下载完整日志文本
     */
    @GetMapping("/{taskId}/logs/download")
    public ResponseEntity<String> downloadLogs(@PathVariable Long taskId) {
        List<TaskLog> logs = taskLogRepository.findByTaskIdOrderByCreatedAtAsc(taskId);
        StringBuilder sb = new StringBuilder();
        for (TaskLog l : logs) {
            sb.append(l.getContent());
        }
        return ResponseEntity.ok()
                .header("Content-Type", "text/plain; charset=UTF-8")
                .header("Content-Disposition", "attachment; filename=task-" + taskId + "-logs.txt")
                .body(sb.toString());
    }

    private Map<String, Object> result(int code, String message) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", code);
        resp.put("message", message);
        return resp;
    }
}
