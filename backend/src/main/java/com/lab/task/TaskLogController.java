package com.lab.task;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.config.TaskLogWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/**
 * 任务实时日志控制器
 * #225 - Agent 上报日志 + 前端轮询查看
 * #229 - 增强过滤 + 批量上报 + WebSocket 推送
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
@RequiredArgsConstructor
public class TaskLogController {

    private final TaskLogRepository taskLogRepository;
    private final TaskLogWebSocketHandler webSocketHandler;
    private final ObjectMapper objectMapper;

    /**
     * Agent POST /api/tasks/{taskId}/logs — 上报执行日志（兼容旧版）
     */
    @PostMapping("/{taskId}/logs")
    public ResponseEntity<Map<String, Object>> appendLogs(
            @PathVariable Long taskId,
            @RequestBody Map<String, Object> body) {
        String content = String.valueOf(body.getOrDefault("content", ""));
        if (content.isEmpty()) {
            return ResponseEntity.ok(result(0, "empty content, skipped"));
        }

        TaskLog logEntry = new TaskLog();
        logEntry.setTaskId(taskId);
        logEntry.setContent(content);
        logEntry.setMessage(content.length() > 2000 ? content.substring(0, 2000) : content);
        logEntry.setLevel(String.valueOf(body.getOrDefault("level", "INFO")));
        logEntry.setLogType(String.valueOf(body.getOrDefault("type", "TEXT")));
        logEntry.setSource(String.valueOf(body.getOrDefault("source", "AGENT")));

        // handle metrics if present
        Object metricsObj = body.get("metrics");
        if (metricsObj != null) {
            try {
                logEntry.setMetrics(objectMapper.writeValueAsString(metricsObj));
            } catch (Exception e) {
                log.warn("Failed to serialize metrics: {}", e.getMessage());
            }
        }

        taskLogRepository.save(logEntry);

        // WebSocket broadcast
        broadcastLog(logEntry);

        log.debug("Received {} chars of logs for task {}", content.length(), taskId);
        return ResponseEntity.ok(result(0, "ok"));
    }

    /**
     * POST /api/tasks/{taskId}/logs/batch — 批量结构化上报
     * #229
     */
    @PostMapping("/{taskId}/logs/batch")
    public ResponseEntity<Map<String, Object>> batchAppendLogs(
            @PathVariable Long taskId,
            @RequestBody Map<String, Object> body) {

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> entries = (List<Map<String, Object>>) body.get("entries");
        if (entries == null || entries.isEmpty()) {
            return ResponseEntity.ok(result(0, "empty entries, skipped"));
        }

        List<TaskLog> savedLogs = new ArrayList<>();
        for (Map<String, Object> entry : entries) {
            TaskLog logEntry = new TaskLog();
            logEntry.setTaskId(taskId);
            logEntry.setMessage(String.valueOf(entry.getOrDefault("message", "")));
            logEntry.setContent(String.valueOf(entry.getOrDefault("message", "")));
            logEntry.setLevel(String.valueOf(entry.getOrDefault("level", "INFO")));
            logEntry.setLogType(String.valueOf(entry.getOrDefault("type", "TEXT")));
            logEntry.setSource(String.valueOf(entry.getOrDefault("source", "AGENT")));

            Object metricsObj = entry.get("metrics");
            if (metricsObj != null) {
                try {
                    logEntry.setMetrics(objectMapper.writeValueAsString(metricsObj));
                } catch (Exception e) {
                    log.warn("Failed to serialize metrics: {}", e.getMessage());
                }
            }

            Object ctxObj = entry.get("context");
            if (ctxObj != null) {
                try {
                    logEntry.setContext(objectMapper.writeValueAsString(ctxObj));
                } catch (Exception e) {
                    log.warn("Failed to serialize context: {}", e.getMessage());
                }
            }

            savedLogs.add(logEntry);
        }

        taskLogRepository.saveAll(savedLogs);

        // WebSocket broadcast each log
        for (TaskLog savedLog : savedLogs) {
            broadcastLog(savedLog);
        }

        log.debug("Batch received {} log entries for task {}", savedLogs.size(), taskId);
        return ResponseEntity.ok(result(0, "ok, saved " + savedLogs.size()));
    }

    /**
     * GET /api/tasks/{taskId}/logs — 获取任务执行日志
     * #229: 增加 afterId, level, type, keyword, limit 参数
     */
    @GetMapping("/{taskId}/logs")
    public ResponseEntity<Map<String, Object>> getLogs(
            @PathVariable Long taskId,
            @RequestParam(required = false) Long afterId,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false, defaultValue = "200") int limit) {

        List<TaskLog> logs;
        if (keyword != null && !keyword.isEmpty()) {
            // Use native query for keyword search
            logs = taskLogRepository.findFilteredWithKeyword(taskId, afterId, level, type, keyword, limit);
        } else {
            logs = taskLogRepository.findFiltered(taskId, afterId, level, type, PageRequest.of(0, limit));
        }

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
            if (l.getCreatedAt() != null) {
                sb.append("[").append(l.getCreatedAt()).append("] ");
            }
            if (l.getLevel() != null) {
                sb.append("[").append(l.getLevel()).append("] ");
            }
            if (l.getLogType() != null && !"TEXT".equals(l.getLogType())) {
                sb.append("[").append(l.getLogType()).append("] ");
            }
            sb.append(l.getMessage() != null ? l.getMessage() : l.getContent());
            sb.append("\n");
        }
        return ResponseEntity.ok()
                .header("Content-Type", "text/plain; charset=UTF-8")
                .header("Content-Disposition", "attachment; filename=task-" + taskId + "-logs.txt")
                .body(sb.toString());
    }

    /**
     * Broadcast a log entry via WebSocket
     */
    private void broadcastLog(TaskLog logEntry) {
        try {
            Map<String, Object> wsMessage = new HashMap<>();
            wsMessage.put("type", "LOG_ENTRY");
            Map<String, Object> data = new HashMap<>();
            data.put("id", logEntry.getId());
            data.put("taskId", logEntry.getTaskId());
            data.put("level", logEntry.getLevel());
            data.put("logType", logEntry.getLogType());
            data.put("message", logEntry.getMessage());
            data.put("content", logEntry.getContent());
            data.put("metrics", logEntry.getMetrics());
            data.put("source", logEntry.getSource());
            data.put("createdAt", logEntry.getCreatedAt() != null ? logEntry.getCreatedAt().toString() : Instant.now().toString());
            wsMessage.put("data", data);

            String json = objectMapper.writeValueAsString(wsMessage);
            webSocketHandler.broadcastToTask(logEntry.getTaskId(), json);
        } catch (Exception e) {
            log.warn("WebSocket broadcast failed for task {}: {}", logEntry.getTaskId(), e.getMessage());
        }
    }

    private Map<String, Object> result(int code, String message) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", code);
        resp.put("message", message);
        return resp;
    }
}
