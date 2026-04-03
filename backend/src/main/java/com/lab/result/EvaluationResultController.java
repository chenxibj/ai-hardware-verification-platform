package com.lab.result;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 评测结果控制器
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class EvaluationResultController {

    private final EvaluationResultRepository resultRepository;
    private final EvaluationResultService resultService;

    @GetMapping("/results")
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
    public ResponseEntity<Map<String, Object>> getResultsByPlan(@PathVariable Long planId) {
        List<EvaluationResult> results = resultRepository.findByPlanId(planId);
        return ResponseEntity.ok(success(results));
    }

    @GetMapping("/chips/{chipId}/results")
    public ResponseEntity<Map<String, Object>> getResultsByChip(@PathVariable Long chipId) {
        List<EvaluationResult> results = resultRepository.findByChipId(chipId);
        return ResponseEntity.ok(success(results));
    }

    /**
     * Agent 提交任务结果 (permitAll in SecurityConfig)
     */
    @PostMapping("/tasks/{taskId}/result")
    public ResponseEntity<Map<String, Object>> submitResult(
            @PathVariable Long taskId,
            @RequestBody Map<String, Object> body) {
        try {
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
     */
    @PostMapping("/tasks/{taskId}/failure")
    public ResponseEntity<Map<String, Object>> submitFailure(
            @PathVariable Long taskId,
            @RequestBody Map<String, String> body) {
        try {
            String errorMsg = body.getOrDefault("error", "Unknown error");
            EvaluationResult result = resultService.submitFailure(taskId, errorMsg);
            return ResponseEntity.ok(success(result));
        } catch (Exception e) {
            log.error("Failed to submit failure for task {}", taskId, e);
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /**
     * 获取计划的维度评分
     */
    @GetMapping("/plans/{planId}/scores")
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
    public ResponseEntity<Map<String, Object>> createResult(@RequestBody EvaluationResult result) {
        EvaluationResult saved = resultRepository.save(result);
        return ResponseEntity.ok(success(saved));
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
}
