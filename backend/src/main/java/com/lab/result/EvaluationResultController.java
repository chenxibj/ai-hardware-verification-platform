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
