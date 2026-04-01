package com.lab.log;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/eval-logs")
@RequiredArgsConstructor
public class LogController {
    private final EvalLogRepository logRepo;

    @GetMapping
    public ResponseEntity<Map<String, Object>> list(
            @RequestParam(required = false) Long taskId,
            @RequestParam(required = false) String level,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<EvalLog> logs;
        if (taskId != null && level != null) logs = logRepo.findByTaskIdAndLogLevel(taskId, level, pageable);
        else if (taskId != null) logs = logRepo.findByTaskId(taskId, pageable);
        else if (level != null) logs = logRepo.findByLogLevel(level, pageable);
        else logs = logRepo.findAll(pageable);
        return ResponseEntity.ok(Map.of("code", 0, "data", logs.getContent(), "total", logs.getTotalElements()));
    }

    @GetMapping("/task/{taskId}")
    public ResponseEntity<Map<String, Object>> getByTask(@PathVariable Long taskId) {
        var logs = logRepo.findByTaskId(taskId, PageRequest.of(0, 500, Sort.by(Sort.Direction.ASC, "createdAt")));
        return ResponseEntity.ok(Map.of("code", 0, "data", logs.getContent(), "total", logs.getTotalElements()));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats() {
        return ResponseEntity.ok(Map.of("code", 0, "data", Map.of(
            "total", logRepo.count(),
            "info", logRepo.countByLogLevel("INFO"),
            "warn", logRepo.countByLogLevel("WARN"),
            "error", logRepo.countByLogLevel("ERROR")
        )));
    }
}
