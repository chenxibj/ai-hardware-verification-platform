package com.lab.baseline;

import com.lab.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * #528: Baseline 管理 API
 * 支持查看芯片 baseline、设置默认 baseline、查询覆盖率。
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class BaselineController {

    private final BaselineService baselineService;

    /**
     * GET /api/chips/{id}/baselines — 列出该芯片可用的 baseline（按 run_spec 分组）
     */
    @GetMapping("/chips/{id}/baselines")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listBaselines(@PathVariable Long id) {
        try {
            List<Map<String, Object>> baselines = baselineService.listBaselines(id);
            return ResponseEntity.ok(ApiResponse.ok(baselines));
        } catch (Exception e) {
            log.error("#528: Failed to list baselines for chip {}: {}", id, e.getMessage());
            return ResponseEntity.badRequest().body(ApiResponse.error("BASELINE-001", e.getMessage()));
        }
    }

    /**
     * PUT /api/chips/{id}/baseline — 设置默认 baseline Plan
     */
    @PutMapping("/chips/{id}/baseline")
    public ResponseEntity<ApiResponse<Map<String, Object>>> setDefaultBaseline(
            @PathVariable Long id,
            @RequestBody Map<String, Object> request) {
        try {
            Long planId = Long.valueOf(request.get("planId").toString());
            Map<String, Object> result = baselineService.setDefaultBaseline(id, planId);
            return ResponseEntity.ok(ApiResponse.ok(result));
        } catch (Exception e) {
            log.error("#528: Failed to set baseline for chip {}: {}", id, e.getMessage());
            return ResponseEntity.badRequest().body(ApiResponse.error("BASELINE-002", e.getMessage()));
        }
    }

    /**
     * GET /api/baselines/coverage — 查询 baseline 覆盖率
     */
    @GetMapping("/baselines/coverage")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getBaselineCoverage(
            @RequestParam(required = false) Long chipId,
            @RequestParam(required = false) Long runSpecId) {
        try {
            Map<String, Object> coverage = baselineService.getBaselineCoverage(chipId, runSpecId);
            return ResponseEntity.ok(ApiResponse.ok(coverage));
        } catch (Exception e) {
            log.error("#528: Failed to get baseline coverage: {}", e.getMessage());
            return ResponseEntity.badRequest().body(ApiResponse.error("BASELINE-003", e.getMessage()));
        }
    }
}
