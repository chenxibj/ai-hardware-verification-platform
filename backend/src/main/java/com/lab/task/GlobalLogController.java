package com.lab.task;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

/**
 * #244: Plan-level log endpoint
 * #246: Global log center API
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class GlobalLogController {

    private final TaskLogRepository taskLogRepository;

    /**
     * GET /api/plans/{planId}/logs — Plan-level logs (aggregated across all tasks)
     */
    @GetMapping("/plans/{planId}/logs")
    public ResponseEntity<Map<String, Object>> getPlanLogs(
            @PathVariable Long planId,
            @RequestParam(required = false) Long afterId,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false, defaultValue = "200") int limit) {

        String effectiveLevel = (level != null && !level.isEmpty() && !"ALL".equalsIgnoreCase(level)) ? level : null;
        String effectiveType = (type != null && !type.isEmpty() && !"ALL".equalsIgnoreCase(type)) ? type : null;

        List<TaskLog> logs;
        if (keyword != null && !keyword.isEmpty()) {
            logs = taskLogRepository.findByPlanIdFilteredWithKeyword(
                    planId, afterId, effectiveLevel, effectiveType, keyword, limit);
        } else {
            logs = taskLogRepository.findByPlanIdFiltered(
                    planId, afterId, effectiveLevel, effectiveType,
                    PageRequest.of(0, limit));
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("items", logs);
        data.put("hasMore", logs.size() == limit);
        if (!logs.isEmpty()) {
            data.put("nextCursor", String.valueOf(logs.get(logs.size() - 1).getId()));
        }

        long totalCount = taskLogRepository.countByPlanId(planId);

        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 0);
        resp.put("message", "success");
        resp.put("data", data);
        resp.put("total", totalCount);
        return ResponseEntity.ok(resp);
    }

    /**
     * GET /api/plans/{planId}/logs/stats — Plan-level log stats
     */
    @GetMapping("/plans/{planId}/logs/stats")
    public ResponseEntity<Map<String, Object>> getPlanLogStats(@PathVariable Long planId) {
        long total = taskLogRepository.countByPlanId(planId);
        List<Object[]> levelRows = taskLogRepository.countByPlanIdGroupByLevel(planId);
        Map<String, Long> byLevel = new LinkedHashMap<>();
        for (Object[] row : levelRows) {
            byLevel.put(String.valueOf(row[0]), (Long) row[1]);
        }
        List<Object[]> typeRows = taskLogRepository.countByPlanIdGroupByLogType(planId);
        Map<String, Long> byType = new LinkedHashMap<>();
        for (Object[] row : typeRows) {
            byType.put(String.valueOf(row[0]), (Long) row[1]);
        }

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", total);
        stats.put("byLevel", byLevel);
        stats.put("byType", byType);

        return ResponseEntity.ok(Map.of("code", 0, "data", stats, "message", "success"));
    }

    /**
     * GET /api/logs/global — Global log center
     * #246: Supports multi-dimensional filtering + pagination
     */
    @GetMapping("/logs/global")
    public ResponseEntity<Map<String, Object>> getGlobalLogs(
            @RequestParam(required = false) Long planId,
            @RequestParam(required = false) Long taskId,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String logType,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(required = false, defaultValue = "50") int size,
            @RequestParam(required = false, defaultValue = "0") int page) {

        String effectiveLevel = (level != null && !level.isEmpty() && !"ALL".equalsIgnoreCase(level)) ? level : null;
        String effectiveType = (logType != null && !logType.isEmpty() && !"ALL".equalsIgnoreCase(logType)) ? logType : null;
        String effectiveSearch = (search != null && !search.isEmpty()) ? search : null;

        int offset = page * size;
        List<TaskLog> logs = taskLogRepository.findGlobalFiltered(
                planId, taskId, effectiveLevel, effectiveType,
                effectiveSearch, startTime, endTime, size, offset);

        long total = taskLogRepository.countGlobalFiltered(
                planId, taskId, effectiveLevel, effectiveType,
                effectiveSearch, startTime, endTime);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("items", logs);
        data.put("total", total);
        data.put("page", page);
        data.put("size", size);
        data.put("hasMore", (long)(page + 1) * size < total);

        return ResponseEntity.ok(Map.of("code", 0, "data", data, "message", "success"));
    }

    /**
     * GET /api/logs/global/stats — Global log stats for dashboard cards
     */
    @GetMapping("/logs/global/stats")
    public ResponseEntity<Map<String, Object>> getGlobalLogStats() {
        long total = taskLogRepository.countAll();
        long errorCount = taskLogRepository.countByLevel("ERROR");
        long warnCount = taskLogRepository.countByLevel("WARN");

        // Today's logs
        Instant todayStart = LocalDate.now(ZoneId.of("Asia/Shanghai"))
                .atStartOfDay(ZoneId.of("Asia/Shanghai")).toInstant();
        long todayCount = taskLogRepository.countSince(todayStart);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", total);
        stats.put("error", errorCount);
        stats.put("warn", warnCount);
        stats.put("today", todayCount);

        return ResponseEntity.ok(Map.of("code", 0, "data", stats, "message", "success"));
    }
}
