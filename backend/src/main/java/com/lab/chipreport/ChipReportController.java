package com.lab.chipreport;

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
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 芯片评测报告控制器
 * #169: 报告管理增强 — 筛选/归档/软删除/版本趋势
 */
@Slf4j
@RestController
@RequestMapping("/chip-reports")
@RequiredArgsConstructor
public class ChipReportController {

    private final ChipReportRepository reportRepository;
    private final ReportGeneratorService reportGeneratorService;

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
        if (report.getArchived() == null) report.setArchived(false);
        if (report.getDeleted() == null) report.setDeleted(false);
        ChipReport saved = reportRepository.save(report);
        log.info("Created report: {}", saved.getReportNo());
        return ResponseEntity.ok(success(saved));
    }

    /**
     * #169: 增强列表 — 支持芯片ID/状态/归档/时间范围筛选
     */
    @GetMapping
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> listReports(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long chipId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Boolean archived,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {
        Pageable pageable = PageRequest.of(page, size);
        ChipReport.ReportStatus statusEnum = null;
        if (status != null && !status.isEmpty()) {
            try { statusEnum = ChipReport.ReportStatus.valueOf(status); } catch (Exception ignored) {}
        }
        Instant start = null, end = null;
        try { if (startTime != null) start = Instant.parse(startTime); } catch (Exception ignored) {}
        try { if (endTime != null) end = Instant.parse(endTime); } catch (Exception ignored) {}

        Page<ChipReport> reports = reportRepository.findAll(ChipReportSpec.filtered(chipId, statusEnum, archived, start, end), pageable);
        Map<String, Object> resp = success(reports.getContent());
        resp.put("total", reports.getTotalElements());
        resp.put("page", page);
        resp.put("size", size);
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
            if (update.getArchived() != null) report.setArchived(update.getArchived());
            ChipReport saved = reportRepository.save(report);
            return ResponseEntity.ok(success(saved));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /**
     * #169: 归档报告
     */
    @PostMapping("/{id}/archive")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> archiveReport(@PathVariable Long id) {
        try {
            ChipReport report = reportRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Report not found: " + id));
            report.setArchived(!Boolean.TRUE.equals(report.getArchived()));
            reportRepository.save(report);
            return ResponseEntity.ok(success(report));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /**
     * #169: 软删除
     */
    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> softDeleteReport(@PathVariable Long id) {
        try {
            ChipReport report = reportRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Report not found: " + id));
            report.setDeleted(true);
            report.setDeletedAt(Instant.now());
            reportRepository.save(report);
            return ResponseEntity.ok(success("已删除"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /**
     * #169: 统计信息
     */
    @GetMapping("/stats")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("total", reportRepository.countByDeletedFalse());
        stats.put("published", reportRepository.countByDeletedFalseAndStatus(ChipReport.ReportStatus.PUBLISHED));
        stats.put("draft", reportRepository.countByDeletedFalseAndStatus(ChipReport.ReportStatus.DRAFT));
        stats.put("archived", reportRepository.countByDeletedFalseAndArchivedTrue());
        return ResponseEntity.ok(success(stats));
    }

    /**
     * #169: 版本趋势 — 同芯片多报告评分变化
     */
    @GetMapping("/trend/{chipId}")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getChipTrend(@PathVariable Long chipId) {
        List<ChipReport> reports = reportRepository.findByChipIdOrderByCreatedAtAsc(chipId);
        return ResponseEntity.ok(success(reports));
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

    @PostMapping("/regenerate/{planId}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> regenerateReport(@PathVariable Long planId) {
        ChipReport report = reportGeneratorService.generateReport(planId);
        return ResponseEntity.ok(Map.of("code", 0, "message", "Report regenerated", "data", report));
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
