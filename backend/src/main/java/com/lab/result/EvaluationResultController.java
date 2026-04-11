package com.lab.result;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.chipreport.ChipReport;
import com.lab.chipreport.ChipReportRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.task.TaskLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 评测结果控制器
 * #233 P2-3: 添加 /tasks/{taskId}/report 日志↔报告关联
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class EvaluationResultController {

    private final EvaluationResultRepository resultRepository;
    private final EvaluationTaskRepository taskRepository;
    private final EvaluationResultService resultService;
    private final ChipReportRepository chipReportRepository;
    private final TaskLogRepository taskLogRepository;

    @GetMapping("/results")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> listResults(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<EvaluationResult> results = resultRepository.findAll(pageable);
        Map<String, Object> resp = success(results.getContent());
        resp.put("total", results.getTotalElements());
        resp.put("page", page);
        resp.put("size", size);
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/results/{id}")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getResult(@PathVariable Long id) {
        try {
            EvaluationResult result = resultRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Result not found: " + id));
            return ResponseEntity.ok(success(result));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @GetMapping("/plans/{planId}/results")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getResultsByPlan(@PathVariable Long planId) {
        List<EvaluationResult> results = resultRepository.findByPlanId(planId);
        return ResponseEntity.ok(success(results));
    }

    @GetMapping("/chips/{chipId}/results")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getResultsByChip(@PathVariable Long chipId) {
        List<EvaluationResult> results = resultRepository.findByChipId(chipId);
        return ResponseEntity.ok(success(results));
    }

    /**
     * Agent 提交任务结果 (permitAll in SecurityConfig)
     * #360: 如果任务已终态，返回 410 Gone 告知 Agent 停止重试
     */
    @PostMapping("/tasks/{taskId}/result")
    public ResponseEntity<Map<String, Object>> submitResult(
            @PathVariable Long taskId,
            @RequestBody Map<String, Object> body) {
        try {
            // #360: Check if task is already in terminal state
            var taskOpt = taskRepository.findById(taskId);
            if (taskOpt.isPresent()) {
                EvaluationTask task = taskOpt.get();
                if (task.getStatus() == EvaluationTask.TaskStatus.COMPLETED ||
                    task.getStatus() == EvaluationTask.TaskStatus.FAILED ||
                    task.getStatus() == EvaluationTask.TaskStatus.CANCELLED) {
                    log.warn("Task {} is already in terminal state {}, returning 410 Gone", taskId, task.getStatus());
                    Map<String, Object> resp = new HashMap<>();
                    resp.put("code", 4100);
                    resp.put("message", "Task " + taskId + " is already " + task.getStatus() + ", stop retrying");
                    return ResponseEntity.status(org.springframework.http.HttpStatus.GONE).body(resp);
                }
            } else {
                log.warn("Task {} not found, returning 410 Gone", taskId);
                Map<String, Object> resp = new HashMap<>();
                resp.put("code", 4100);
                resp.put("message", "Task " + taskId + " not found, stop retrying");
                return ResponseEntity.status(org.springframework.http.HttpStatus.GONE).body(resp);
            }

            String rawData = body.containsKey("rawData")
                    ? body.get("rawData").toString()
                    : new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(body);
            EvaluationResult result = resultService.submitResult(taskId, rawData);
            return ResponseEntity.ok(success(result));
        } catch (Exception e) {
            log.error("Failed to submit result for task {}", taskId, e);
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /**
     * Agent 报告任务失败
     * #360: 如果任务已终态，返回 410 Gone 告知 Agent 停止重试
     */
    @PostMapping("/tasks/{taskId}/failure")
    public ResponseEntity<Map<String, Object>> submitFailure(
            @PathVariable Long taskId,
            @RequestBody Map<String, String> body) {
        try {
            // #360: Check if task is already in terminal state
            var taskOpt = taskRepository.findById(taskId);
            if (taskOpt.isPresent()) {
                EvaluationTask task = taskOpt.get();
                if (task.getStatus() == EvaluationTask.TaskStatus.COMPLETED ||
                    task.getStatus() == EvaluationTask.TaskStatus.FAILED ||
                    task.getStatus() == EvaluationTask.TaskStatus.CANCELLED) {
                    log.warn("Task {} is already in terminal state {}, returning 410 Gone", taskId, task.getStatus());
                    Map<String, Object> resp = new HashMap<>();
                    resp.put("code", 4100);
                    resp.put("message", "Task " + taskId + " is already " + task.getStatus() + ", stop retrying");
                    return ResponseEntity.status(org.springframework.http.HttpStatus.GONE).body(resp);
                }
            }

            String errorMsg = body.getOrDefault("error", "Unknown error");
            EvaluationResult result = resultService.submitFailure(taskId, errorMsg);
            return ResponseEntity.ok(success(result));
        } catch (Exception e) {
            log.error("Failed to submit failure for task {}", taskId, e);
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @GetMapping("/plans/{planId}/scores")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getPlanScores(@PathVariable Long planId) {
        try {
            Map<String, Double> dimScores = resultService.calculateDimensionScores(planId);
            double overall = resultService.calculateOverallScore(dimScores);
            Map<String, Object> data = new HashMap<>();
            data.put("dimensionScores", dimScores);
            data.put("overallScore", overall);
            return ResponseEntity.ok(success(data));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PostMapping("/results")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> createResult(@RequestBody EvaluationResult result) {
        EvaluationResult saved = resultRepository.save(result);
        return ResponseEntity.ok(success(saved));
    }

    /**
     * GET /api/tasks/{taskId}/report — 日志↔报告关联
     * P2-3: 通过 taskId 获取评测结果和关联的报告
     */
    @GetMapping("/tasks/{taskId}/report")
    public ResponseEntity<Map<String, Object>> getTaskReport(@PathVariable Long taskId) {
        Map<String, Object> data = new LinkedHashMap<>();

        // 1. 查找评测结果
        Optional<EvaluationResult> resultOpt = resultRepository.findByTaskId(taskId);
        data.put("result", resultOpt.orElse(null));

        // 2. 如果评测结果有 planId，查找关联的报告
        if (resultOpt.isPresent()) {
            Long planId = resultOpt.get().getPlanId();
            if (planId != null) {
                List<ChipReport> reports = chipReportRepository.findByPlanId(planId);
                data.put("reports", reports);
            } else {
                data.put("reports", List.of());
            }
        } else {
            data.put("reports", List.of());
        }

        // 3. 日志统计摘要
        long logCount = taskLogRepository.countByTaskId(taskId);
        data.put("logCount", logCount);

        return ResponseEntity.ok(Map.of("code", 0, "data", data, "message", "success"));
    }

    private Map<String, Object> success(Object data) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 0);
        resp.put("message", "success");
        resp.put("data", data);
        return resp;
    }

    private Map<String, Object> error(String message) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 1001);
        resp.put("message", message);
        return resp;
    }

    @GetMapping("/results/by-task")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getResultByTaskId(@RequestParam Long taskId) {
        try {
            EvaluationResult result = resultRepository.findByTaskId(taskId)
                    .orElseThrow(() -> new RuntimeException("Result not found for task: " + taskId));
            return ResponseEntity.ok(success(result));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }
}
