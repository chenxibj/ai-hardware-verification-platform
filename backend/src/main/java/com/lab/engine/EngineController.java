package com.lab.engine;

import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/engine")
@RequiredArgsConstructor
public class EngineController {
    private final EvalExecutionEngine engine;
    private final EvaluationTaskRepository taskRepo;

    @PostMapping("/execute/{taskId}")
    public ResponseEntity<Map<String, Object>> execute(@PathVariable Long taskId) {
        log.info("Manual trigger execution for task: {}", taskId);
        new Thread(() -> engine.executeTask(taskId)).start();
        return ResponseEntity.ok(Map.of("code", 0, "message", "任务已提交执行"));
    }

    @PostMapping("/batch-execute")
    public ResponseEntity<Map<String, Object>> batchExecute(@RequestBody Map<String, List<Long>> body) {
        List<Long> ids = body.getOrDefault("ids", Collections.emptyList());
        ids.forEach(id -> new Thread(() -> engine.executeTask(id)).start());
        return ResponseEntity.ok(Map.of("code", 0, "message", "批量提交 " + ids.size() + " 个任务"));
    }

    @GetMapping("/status/{taskId}")
    public ResponseEntity<Map<String, Object>> status(@PathVariable Long taskId) {
        return taskRepo.findById(taskId)
            .map(t -> ResponseEntity.ok(Map.<String, Object>of("code", 0, "data", Map.of(
                "taskId", t.getId(), "status", t.getStatus(), "progress", t.getProgress() != null ? t.getProgress() : 0,
                "startedAt", t.getStartedAt() != null ? t.getStartedAt().toString() : "",
                "errorMessage", t.getErrorMessage() != null ? t.getErrorMessage() : ""))))
            .orElse(ResponseEntity.ok(Map.of("code", 1, "message", "任务不存在")));
    }
}
