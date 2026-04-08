package com.lab.task;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.config.TaskLogWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * 任务实时日志控制器
 * #225 - Agent 上报日志 + 前端轮询查看
 * #229 - 增强过滤 + 批量上报 + WebSocket 推送
 * #233 - stats/metrics/METRIC渲染/游标分页/多格式导出
 * #234 - 搜索过滤
 * #243 - batchId 幂等 + planId/nodeId 支持
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
@RequiredArgsConstructor
public class TaskLogController {

    private final TaskLogRepository taskLogRepository;
    private final EvaluationTaskRepository evaluationTaskRepository;
    private final TaskLogWebSocketHandler webSocketHandler;
    private final ObjectMapper objectMapper;

    // #243: batchId 幂等缓存 — batchId -> 写入时间戳（TTL 10min）
    private final ConcurrentHashMap<String, Long> processedBatchIds = new ConcurrentHashMap<>();

    /**
     * #243: 定时清理过期 batchId（每 5 分钟执行一次，TTL 10 分钟）
     */
    @Scheduled(fixedRate = 300_000)
    public void cleanupExpiredBatchIds() {
        long cutoff = System.currentTimeMillis() - 600_000; // 10 min
        processedBatchIds.entrySet().removeIf(e -> e.getValue() < cutoff);
    }

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

        // #244: Auto-fill planId from task if not provided
        EvaluationTask task = evaluationTaskRepository.findById(taskId).orElse(null);
        if (task != null && task.getPlanId() != null) {
            logEntry.setPlanId(task.getPlanId());
        }

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
     * #229 + #243: 支持 batchId 幂等 + 新格式 { batchId, logs: [...] }
     * 向后兼容旧格式 { entries: [...] }
     */
    @PostMapping("/{taskId}/logs/batch")
    public ResponseEntity<Map<String, Object>> batchAppendLogs(
            @PathVariable Long taskId,
            @RequestBody Map<String, Object> body) {

        // #243: batchId 幂等检查
        String batchId = (String) body.get("batchId");
        if (batchId != null && !batchId.isEmpty()) {
            Long prev = processedBatchIds.putIfAbsent(batchId, System.currentTimeMillis());
            if (prev != null) {
                log.debug("Duplicate batchId={} for task {}, skipping", batchId, taskId);
                return ResponseEntity.ok(result(0, "duplicate batchId, skipped"));
            }
        }

        // 兼容新旧格式: "logs" (新) 或 "entries" (旧)
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> entries = (List<Map<String, Object>>) body.get("logs");
        if (entries == null) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> oldEntries = (List<Map<String, Object>>) body.get("entries");
            entries = oldEntries;
        }
        if (entries == null || entries.isEmpty()) {
            return ResponseEntity.ok(result(0, "empty entries, skipped"));
        }

        // #244: Resolve planId from task as fallback
        Long resolvedPlanId = null;
        EvaluationTask task = evaluationTaskRepository.findById(taskId).orElse(null);
        if (task != null) {
            resolvedPlanId = task.getPlanId();
        }

        List<TaskLog> savedLogs = new ArrayList<>();
        for (Map<String, Object> entry : entries) {
            TaskLog logEntry = new TaskLog();
            logEntry.setTaskId(taskId);
            logEntry.setMessage(String.valueOf(entry.getOrDefault("message", "")));
            logEntry.setContent(String.valueOf(entry.getOrDefault("message", "")));
            logEntry.setLevel(String.valueOf(entry.getOrDefault("level", "INFO")));
            // 兼容 "logType" (新) 和 "type" (旧)
            String logType = entry.containsKey("logType")
                    ? String.valueOf(entry.get("logType"))
                    : String.valueOf(entry.getOrDefault("type", "TEXT"));
            logEntry.setLogType(logType);
            logEntry.setSource(String.valueOf(entry.getOrDefault("source", "AGENT")));

            // #243: planId / nodeId
            Object planIdObj = entry.get("planId");
            if (planIdObj != null) {
                try {
                    logEntry.setPlanId(Long.valueOf(String.valueOf(planIdObj)));
                } catch (NumberFormatException ignored) {}
            }
            // #244: Auto-fill planId from task if not provided by agent
            if (logEntry.getPlanId() == null && resolvedPlanId != null) {
                logEntry.setPlanId(resolvedPlanId);
            }
            Object nodeIdObj = entry.get("nodeId");
            if (nodeIdObj != null) {
                logEntry.setNodeId(String.valueOf(nodeIdObj));
            }

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

        log.debug("Batch received {} log entries for task {} (batchId={})", savedLogs.size(), taskId, batchId);
        return ResponseEntity.ok(result(0, "ok, saved " + savedLogs.size()));
    }

    /**
     * GET /api/tasks/{taskId}/logs — 获取任务执行日志
     * #229: 增加 afterId, level, type, keyword, limit 参数
     * #233: 增加游标分页 (after/before), from/to 时间, order; 返回 { items, hasMore, nextCursor }
     */
    @GetMapping("/{taskId}/logs")
    public ResponseEntity<Map<String, Object>> getLogs(
            @PathVariable Long taskId,
            @RequestParam(required = false) Long afterId,
            @RequestParam(required = false) Long after,
            @RequestParam(required = false) Long before,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false, defaultValue = "200") int limit,
            @RequestParam(required = false, defaultValue = "asc") String order) {

        // Merge afterId and after for backward compatibility
        Long effectiveAfter = after != null ? after : afterId;
        String effectiveLevel = (level != null && !level.isEmpty() && !"ALL".equalsIgnoreCase(level)) ? level : null;
        String effectiveType = (type != null && !type.isEmpty() && !"ALL".equalsIgnoreCase(type)) ? type : null;

        List<TaskLog> logs;
        if (keyword != null && !keyword.isEmpty()) {
            logs = taskLogRepository.findFilteredCursorWithKeyword(
                    taskId, effectiveAfter, before, effectiveLevel, effectiveType, keyword, limit);
        } else {
            logs = taskLogRepository.findFilteredCursor(
                    taskId, effectiveAfter, before, effectiveLevel, effectiveType,
                    PageRequest.of(0, limit));
        }

        // Build cursor-paginated response
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("items", logs);
        data.put("hasMore", logs.size() == limit);
        if (!logs.isEmpty()) {
            data.put("nextCursor", String.valueOf(logs.get(logs.size() - 1).getId()));
        }

        long totalCount = taskLogRepository.countByTaskId(taskId);

        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 0);
        resp.put("message", "success");
        resp.put("data", data);
        resp.put("total", totalCount);
        return ResponseEntity.ok(resp);
    }

    /**
     * GET /api/tasks/{taskId}/logs/stats — 日志统计接口
     * #233
     */
    @GetMapping("/{taskId}/logs/stats")
    public ResponseEntity<Map<String, Object>> getLogStats(@PathVariable Long taskId) {
        long totalCount = taskLogRepository.countByTaskId(taskId);

        // Group by level
        List<Object[]> levelRows = taskLogRepository.countByTaskIdGroupByLevel(taskId);
        Map<String, Long> byLevel = new LinkedHashMap<>();
        for (Object[] row : levelRows) {
            byLevel.put(String.valueOf(row[0]), (Long) row[1]);
        }

        // Group by type
        List<Object[]> typeRows = taskLogRepository.countByTaskIdGroupByLogType(taskId);
        Map<String, Long> byType = new LinkedHashMap<>();
        for (Object[] row : typeRows) {
            byType.put(String.valueOf(row[0]), (Long) row[1]);
        }

        // Metrics count
        long metricsCount = taskLogRepository.countByTaskIdAndLogType(taskId, "METRIC");

        // Time range
        Instant firstTime = taskLogRepository.findFirstCreatedAtByTaskId(taskId);
        Instant lastTime = taskLogRepository.findLastCreatedAtByTaskId(taskId);
        Map<String, Object> timeRange = new LinkedHashMap<>();
        timeRange.put("first", firstTime != null ? firstTime.toString() : null);
        timeRange.put("last", lastTime != null ? lastTime.toString() : null);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", totalCount);
        stats.put("byLevel", byLevel);
        stats.put("byType", byType);
        stats.put("metricsCount", metricsCount);
        stats.put("timeRange", timeRange);

        return ResponseEntity.ok(Map.of("code", 0, "data", stats, "message", "success"));
    }

    /**
     * GET /api/tasks/{taskId}/logs/metrics — 性能数据聚合
     * P2-1: 按 groupBy 维度聚合 METRIC 类型日志的 metrics JSONB 数据
     */
    @GetMapping("/{taskId}/logs/metrics")
    public ResponseEntity<Map<String, Object>> getLogMetrics(
            @PathVariable Long taskId,
            @RequestParam(defaultValue = "batch_size") String groupBy) {
        List<TaskLog> metricLogs = taskLogRepository.findByTaskIdAndLogType(taskId, "METRIC");

        // Parse and aggregate metrics
        Map<String, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (TaskLog logEntry : metricLogs) {
            Map<String, Object> metricsMap = parseJsonField(logEntry.getMetrics());
            if (metricsMap == null) continue;

            String groupKey = metricsMap.containsKey(groupBy)
                    ? String.valueOf(metricsMap.get(groupBy))
                    : "default";

            grouped.computeIfAbsent(groupKey, k -> new ArrayList<>()).add(metricsMap);
        }

        // Aggregate per group
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> entry : grouped.entrySet()) {
            Map<String, Object> agg = new LinkedHashMap<>();
            agg.put("group", entry.getKey());
            agg.put("count", entry.getValue().size());

            // Average numeric fields
            Map<String, Double> sums = new LinkedHashMap<>();
            Map<String, Integer> counts = new LinkedHashMap<>();
            for (Map<String, Object> m : entry.getValue()) {
                for (Map.Entry<String, Object> field : m.entrySet()) {
                    if (field.getValue() instanceof Number) {
                        String key = field.getKey();
                        sums.merge(key, ((Number) field.getValue()).doubleValue(), Double::sum);
                        counts.merge(key, 1, Integer::sum);
                    }
                }
            }

            Map<String, Double> averages = new LinkedHashMap<>();
            for (String key : sums.keySet()) {
                averages.put(key, Math.round(sums.get(key) / counts.get(key) * 100.0) / 100.0);
            }
            agg.put("averages", averages);
            result.add(agg);
        }

        return ResponseEntity.ok(Map.of("code", 0, "data", result, "message", "success"));
    }

    /**
     * GET /api/tasks/{taskId}/logs/download — 下载日志（多格式）
     * P2-2: 支持 format=txt|json|csv, 支持 level/type 过滤
     */
    @GetMapping("/{taskId}/logs/download")
    public ResponseEntity<String> downloadLogs(
            @PathVariable Long taskId,
            @RequestParam(defaultValue = "txt") String format,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String type) {

        String effectiveLevel = (level != null && !level.isEmpty() && !"ALL".equalsIgnoreCase(level)) ? level : null;
        String effectiveType = (type != null && !type.isEmpty() && !"ALL".equalsIgnoreCase(type)) ? type : null;

        List<TaskLog> logs;
        if (effectiveLevel != null || effectiveType != null) {
            logs = taskLogRepository.findByTaskIdFiltered(taskId, effectiveLevel, effectiveType);
        } else {
            logs = taskLogRepository.findByTaskIdOrderByCreatedAtAsc(taskId);
        }

        String content;
        String contentType;
        String filename;

        switch (format.toLowerCase()) {
            case "json":
                try {
                    content = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(logs);
                } catch (Exception e) {
                    content = "[]";
                }
                contentType = "application/json";
                filename = "task-" + taskId + "-logs.json";
                break;

            case "csv":
                StringBuilder csv = new StringBuilder();
                csv.append("id,timestamp,level,type,source,message\n");
                for (TaskLog l : logs) {
                    csv.append(l.getId()).append(",")
                       .append(l.getCreatedAt() != null ? l.getCreatedAt().toString() : "").append(",")
                       .append(l.getLevel() != null ? l.getLevel() : "").append(",")
                       .append(l.getLogType() != null ? l.getLogType() : "").append(",")
                       .append(l.getSource() != null ? l.getSource() : "").append(",")
                       .append("\"").append(escapeCsv(l.getMessage())).append("\"")
                       .append("\n");
                }
                content = csv.toString();
                contentType = "text/csv";
                filename = "task-" + taskId + "-logs.csv";
                break;

            default: // txt
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
                content = sb.toString();
                contentType = "text/plain";
                filename = "task-" + taskId + "-logs.txt";
                break;
        }

        return ResponseEntity.ok()
                .header("Content-Disposition", "attachment; filename=" + filename)
                .contentType(MediaType.parseMediaType(contentType + "; charset=UTF-8"))
                .body(content);
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
            data.put("planId", logEntry.getPlanId());
            data.put("nodeId", logEntry.getNodeId());
            data.put("sequence", logEntry.getSequence());
            data.put("createdAt", logEntry.getCreatedAt() != null ? logEntry.getCreatedAt().toString() : Instant.now().toString());
            wsMessage.put("data", data);

            String json = objectMapper.writeValueAsString(wsMessage);
            webSocketHandler.broadcastToTask(logEntry.getTaskId(), json);
        } catch (Exception e) {
            log.warn("WebSocket broadcast failed for task {}: {}", logEntry.getTaskId(), e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseJsonField(String jsonStr) {
        if (jsonStr == null || jsonStr.isEmpty()) return null;
        try {
            return objectMapper.readValue(jsonStr, Map.class);
        } catch (Exception e) {
            return null;
        }
    }

    private String escapeCsv(String value) {
        if (value == null) return "";
        return value.replace("\"", "\"\"").replace("\n", " ").replace("\r", "");
    }

    private Map<String, Object> result(int code, String message) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", code);
        resp.put("message", message);
        return resp;
    }
}
