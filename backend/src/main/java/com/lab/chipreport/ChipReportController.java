package com.lab.chipreport;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 芯片评测报告控制器
 * Issues: #169 报告管理, #170 对比分析, #171 导出支持
 */
@Slf4j
@RestController
@RequestMapping("/chip-reports")
@RequiredArgsConstructor
public class ChipReportController {

    private final ChipReportRepository reportRepository;

    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> createReport(
            @RequestBody ChipReport report,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
        report.setReportNo(generateReportNo());
        report.setCreatedBy(userId);
        if (report.getStatus() == null) {
            report.setStatus(ChipReport.ReportStatus.DRAFT);
        }
        ChipReport saved = reportRepository.save(report);
        log.info("Created report: {}", saved.getReportNo());
        return ResponseEntity.ok(success(saved));
    }

    /**
     * #169 分页查询 + 筛选 + 搜索
     * GET /api/chip-reports?page=0&size=10&status=PUBLISHED&chipId=1&minScore=60&maxScore=100&keyword=RPT
     */
    @GetMapping
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> listReports(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long chipId,
            @RequestParam(required = false) Double minScore,
            @RequestParam(required = false) Double maxScore,
            @RequestParam(required = false) String keyword) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<ChipReport> reports;

        if (keyword != null && !keyword.trim().isEmpty()) {
            reports = reportRepository.searchByKeyword(keyword.trim(), pageable);
        } else {
            ChipReport.ReportStatus statusEnum = null;
            if (status != null && !status.isEmpty()) {
                try {
                    statusEnum = ChipReport.ReportStatus.valueOf(status);
                } catch (IllegalArgumentException ignored) {}
            }
            reports = reportRepository.findFiltered(statusEnum, chipId, minScore, maxScore, pageable);
        }

        Map<String, Object> resp = success(reports.getContent());
        resp.put("total", reports.getTotalElements());
        resp.put("page", page);
        resp.put("size", size);
        resp.put("totalPages", reports.getTotalPages());
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/{id}")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getReport(@PathVariable Long id) {
        try {
            ChipReport report = reportRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Report not found: " + id));
            return ResponseEntity.ok(success(report));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> updateReport(
            @PathVariable Long id,
            @RequestBody ChipReport update) {
        try {
            ChipReport report = reportRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Report not found: " + id));
            if (update.getOverallScore() != null) report.setOverallScore(update.getOverallScore());
            if (update.getDimensionScores() != null) report.setDimensionScores(update.getDimensionScores());
            if (update.getRadarData() != null) report.setRadarData(update.getRadarData());
            if (update.getBottleneckAnalysis() != null) report.setBottleneckAnalysis(update.getBottleneckAnalysis());
            if (update.getScenarioRecommendations() != null) report.setScenarioRecommendations(update.getScenarioRecommendations());
            if (update.getOperatorRanking() != null) report.setOperatorRanking(update.getOperatorRanking());
            if (update.getStatus() != null) report.setStatus(update.getStatus());
            ChipReport saved = reportRepository.save(report);
            return ResponseEntity.ok(success(saved));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /**
     * #169 删除报告
     */
    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> deleteReport(@PathVariable Long id) {
        try {
            if (!reportRepository.existsById(id)) {
                return ResponseEntity.badRequest().body(error("Report not found: " + id));
            }
            reportRepository.deleteById(id);
            log.info("Deleted report id={}", id);
            return ResponseEntity.ok(success("deleted"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @GetMapping("/chip/{chipId}")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getReportsByChip(@PathVariable Long chipId) {
        List<ChipReport> reports = reportRepository.findByChipId(chipId);
        return ResponseEntity.ok(success(reports));
    }

    @GetMapping("/plan/{planId}")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getReportsByPlan(@PathVariable Long planId) {
        List<ChipReport> reports = reportRepository.findByPlanId(planId);
        return ResponseEntity.ok(success(reports));
    }

    /**
     * #170 多报告对比
     * GET /api/chip-reports/compare?ids=1,2,3
     */
    @GetMapping("/compare")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> compareReports(@RequestParam List<Long> ids) {
        if (ids == null || ids.size() < 2 || ids.size() > 4) {
            return ResponseEntity.badRequest().body(error("需要2-4份报告进行对比"));
        }
        List<ChipReport> reports = reportRepository.findByIdIn(ids);
        if (reports.size() < 2) {
            return ResponseEntity.badRequest().body(error("未找到足够的报告数据"));
        }
        return ResponseEntity.ok(success(reports));
    }

    private String generateReportNo() {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(ZoneId.of("Asia/Shanghai"))
                .format(Instant.now());
        String seq = String.format("%03d", (int) (Math.random() * 1000));
        return "RPT-" + date + "-" + seq;
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
