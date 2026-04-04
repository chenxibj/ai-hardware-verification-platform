package com.lab.evallog;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * 评测日志控制器
 * #173: 日志查看增强 — 级别过滤/搜索/时间范围/下载
 */
@Slf4j
@RestController
@RequestMapping("/eval-logs")
@RequiredArgsConstructor
public class EvalLogController {

    private final EvalLogRepository logRepository;

    /**
     * 查询日志列表 — 支持级别/任务/搜索/时间范围过滤
     */
    @GetMapping
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> listLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(required = false) Long taskId,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {
        Pageable pageable = PageRequest.of(page, size);
        Instant start = null, end = null;
        try { if (startTime != null) start = Instant.parse(startTime); } catch (Exception ignored) {}
        try { if (endTime != null) end = Instant.parse(endTime); } catch (Exception ignored) {}
        String levelParam = (level != null && !level.isEmpty() && !"ALL".equals(level)) ? level : null;
        String searchParam = (search != null && !search.isEmpty()) ? search : null;

        Page<EvalLog> logs = logRepository.findFiltered(taskId, levelParam, searchParam, start, end, pageable);
        Map<String, Object> resp = success(logs.getContent());
        resp.put("total", logs.getTotalElements());
        resp.put("page", page);
        resp.put("size", size);
        return ResponseEntity.ok(resp);
    }

    /**
     * 日志统计
     */
    @GetMapping("/stats")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("total", logRepository.count());
        stats.put("error", logRepository.countByLogLevel("ERROR"));
        stats.put("warn", logRepository.countByLogLevel("WARN"));
        stats.put("info", logRepository.countByLogLevel("INFO"));
        stats.put("debug", logRepository.countByLogLevel("DEBUG"));
        return ResponseEntity.ok(success(stats));
    }

    private Map<String, Object> success(Object data) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 0);
        resp.put("message", "success");
        resp.put("data", data);
        return resp;
    }
}
