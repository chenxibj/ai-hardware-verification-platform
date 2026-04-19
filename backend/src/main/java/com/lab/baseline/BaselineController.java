package com.lab.baseline;

import com.lab.common.ApiResponse;
import com.lab.chipreport.ChipReport;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * #528: Baseline management API
 * #531: isStale in baseline listing
 * #532: recommended plan in baseline listing
 * #533: Report regeneration on baseline switch + POST /reports/{id}/regenerate
 * #534: roundCount/stdDev in coverage response
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class BaselineController {

    private final BaselineService baselineService;

    /**
     * GET /api/chips/{id}/baselines — List baselines grouped by run_spec
     * #531: Each baseline group includes isStale, staleDays
     * #532: Each plan includes recommended, group includes recommendedPlanId
     */
    @GetMapping("/chips/{id}/baselines")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listBaselines(@PathVariable Long id) {
        try {
            List<Map<String, Object>> baselines = baselineService.listBaselines(id);
            return ResponseEntity.ok(ApiResponse.ok(baselines));
        } catch (Exception e) {
            log.error("Failed to list baselines for chip {}: {}", id, e.getMessage());
            return ResponseEntity.badRequest().body(ApiResponse.error("BASELINE-001", e.getMessage()));
        }
    }

    /**
     * PUT /api/chips/{id}/baseline — Set default baseline plan
     * #533: Triggers report regeneration when baseline changes
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
            log.error("Failed to set baseline for chip {}: {}", id, e.getMessage());
            return ResponseEntity.badRequest().body(ApiResponse.error("BASELINE-002", e.getMessage()));
        }
    }

    /**
     * GET /api/baselines/coverage — Query baseline coverage
     * #534: Includes operators with roundCount, stdDev, unstable
     */
    @GetMapping("/baselines/coverage")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getBaselineCoverage(
            @RequestParam(required = false) Long chipId,
            @RequestParam(required = false) Long runSpecId) {
        try {
            Map<String, Object> coverage = baselineService.getBaselineCoverage(chipId, runSpecId);
            return ResponseEntity.ok(ApiResponse.ok(coverage));
        } catch (Exception e) {
            log.error("Failed to get baseline coverage: {}", e.getMessage());
            return ResponseEntity.badRequest().body(ApiResponse.error("BASELINE-003", e.getMessage()));
        }
    }

    /**
     * #533: POST /api/reports/{id}/regenerate — Manually trigger report regeneration
     */
    @PostMapping("/reports/{id}/regenerate")
    public ResponseEntity<ApiResponse<Map<String, Object>>> regenerateReport(@PathVariable Long id) {
        try {
            ChipReport newReport = baselineService.regenerateReport(id);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("reportId", newReport.getId());
            result.put("reportNo", newReport.getReportNo());
            result.put("planId", newReport.getPlanId());
            result.put("chipId", newReport.getChipId());
            result.put("status", newReport.getStatus() != null ? newReport.getStatus().name() : null);
            return ResponseEntity.ok(ApiResponse.ok(result));
        } catch (Exception e) {
            log.error("#533: Failed to regenerate report {}: {}", id, e.getMessage());
            return ResponseEntity.badRequest().body(ApiResponse.error("BASELINE-004", e.getMessage()));
        }
    }
}
