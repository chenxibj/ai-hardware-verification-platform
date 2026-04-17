package com.lab.chipreport;

import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.auth.RequireRole;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.auth.Role;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.LinkedHashMap;
import com.lab.dimension.DimensionRegistry;
import java.util.ArrayList;

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
    private final ChipRepository chipRepository;
    private final EvaluationPlanRepository planRepository;
    private final ObjectMapper objectMapper;
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
        enrichReports(reports.getContent());
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
            filterBottleneckAnalysis(report);
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
        enrichReports(reports);
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


    /**
     * Set a report as the baseline (可采信结果)
     */
    @PutMapping("/{id}/set-baseline")
    @RequireRole(Role.ENGINEER)
    @Transactional
    public ResponseEntity<Map<String, Object>> setBaseline(@PathVariable Long id) {
        try {
            ChipReport report = reportRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Report not found: " + id));

            // Clear old baseline for this chip
            reportRepository.clearBaselineByChipId(report.getChipId());

            // Set new baseline
            report.setIsBaseline(true);
            reportRepository.save(report);

            // Writeback to chips table
            try {
                Chip chip = chipRepository.findById(report.getChipId()).orElse(null);
                if (chip != null) {
                    chip.setCapabilityProfile(report.getRadarData());
                    Map<String, Object> profileData = new LinkedHashMap<>();
                    profileData.put("overallScore", report.getOverallScore());
                    profileData.put("baselineReportId", report.getId());
                    profileData.put("baselineReportNo", report.getReportNo());
                    profileData.put("baselineDate", report.getCreatedAt() != null ? report.getCreatedAt().toString() : "");
                    if (report.getDimensionScores() != null) {
                        profileData.put("dimensionScores", objectMapper.readValue(report.getDimensionScores(), Map.class));
                    }
                    chip.setProfileData(objectMapper.writeValueAsString(profileData));
                    chipRepository.save(chip);
                }
            } catch (Exception e) {
                log.error("Failed to writeback chip profile", e);
            }

            return ResponseEntity.ok(success(report));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /**
     * Compare multiple reports side by side
     */
    @GetMapping("/compare")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> compareReports(@RequestParam String ids) {
        try {
            List<Long> idList = java.util.Arrays.stream(ids.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(Long::parseLong)
                    .collect(Collectors.toList());

            if (idList.size() < 2 || idList.size() > 5) {
                return ResponseEntity.badRequest().body(error("请选择 2-5 个报告进行对比"));
            }

            List<Map<String, Object>> reportData = new ArrayList<>();
            for (Long rid : idList) {
                ChipReport r = reportRepository.findById(rid).orElse(null);
                if (r == null) continue;

                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", r.getId());
                item.put("reportNo", r.getReportNo());
                item.put("createdAt", r.getCreatedAt() != null ? r.getCreatedAt().toString() : "");
                item.put("overallScore", r.getOverallScore());
                item.put("isBaseline", Boolean.TRUE.equals(r.getIsBaseline()));
                item.put("status", r.getStatus());

                // Parse dimension scores
                Map<String, Object> dims = new LinkedHashMap<>();
                if (r.getDimensionScores() != null) {
                    try {
                        dims = objectMapper.readValue(r.getDimensionScores(), Map.class);
                    } catch (Exception ignored) {}
                }
                item.put("dimensions", dims);

                // Parse operator ranking
                List<Object> ops = new ArrayList<>();
                if (r.getOperatorRanking() != null) {
                    try {
                        ops = objectMapper.readValue(r.getOperatorRanking(), List.class);
                    } catch (Exception ignored) {}
                }
                item.put("operatorRanking", ops);

                // Parse radar data
                if (r.getRadarData() != null) {
                    try {
                        item.put("radarData", objectMapper.readValue(r.getRadarData(), List.class));
                    } catch (Exception ignored) {}
                }

                reportData.add(item);
            }

            // Calculate changes between consecutive reports
            List<Map<String, Object>> changes = new ArrayList<>();
            if (reportData.size() >= 2) {
                // #459: Use DimensionRegistry for dimension keys and labels
                List<String> dimKeysList = DimensionRegistry.allKeys();
                String[] dimKeys = dimKeysList.toArray(new String[0]);
                String[] dimNames = dimKeysList.stream()
                    .map(DimensionRegistry::getLabelByKey)
                    .toArray(String[]::new);

                Map<String, Object> firstDims = (Map<String, Object>) reportData.get(0).getOrDefault("dimensions", Map.of());
                Map<String, Object> lastDims = (Map<String, Object>) reportData.get(reportData.size() - 1).getOrDefault("dimensions", Map.of());

                for (int i = 0; i < dimKeys.length; i++) {
                    double fromVal = toDouble(firstDims.get(dimKeys[i]));
                    double toVal = toDouble(lastDims.get(dimKeys[i]));
                    double delta = toVal - fromVal;

                    Map<String, Object> change = new LinkedHashMap<>();
                    change.put("dimension", dimKeys[i]);
                    change.put("dimensionName", dimNames[i]);
                    change.put("from", fromVal);
                    change.put("to", toVal);
                    change.put("delta", Math.round(delta * 10.0) / 10.0);
                    change.put("direction", delta > 0 ? "up" : delta < 0 ? "down" : "same");
                    changes.add(change);
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("reports", reportData);
            result.put("changes", changes);

            return ResponseEntity.ok(success(result));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }


    /**
     * #476: Filter out high-score worst_operator entries from bottleneckAnalysis.
     * Old reports may contain worst_operator items with score >= 85, which is incorrect.
     */
    private void filterBottleneckAnalysis(ChipReport report) {
        if (report.getBottleneckAnalysis() == null) return;
        try {
            Object parsed = objectMapper.readValue(report.getBottleneckAnalysis(), Object.class);
            if (parsed instanceof java.util.List) {
                @SuppressWarnings("unchecked")
                java.util.List<java.util.Map<String, Object>> items = (java.util.List<java.util.Map<String, Object>>) parsed;
                java.util.List<java.util.Map<String, Object>> filtered = items.stream()
                    .filter(item -> {
                        String type = (String) item.get("type");
                        Object scoreObj = item.get("score");
                        if ("worst_operator".equals(type) && scoreObj != null) {
                            double score = scoreObj instanceof Number ? ((Number) scoreObj).doubleValue() : 0;
                            return score < 85;
                        }
                        return true;
                    })
                    .collect(Collectors.toList());
                report.setBottleneckAnalysis(objectMapper.writeValueAsString(filtered));
            }
        } catch (Exception e) {
            log.debug("Failed to filter bottleneckAnalysis for report {}: {}", report.getId(), e.getMessage());
        }
    }

    private void enrichReport(ChipReport report) {
        if (report.getChipId() != null) {
            chipRepository.findById(report.getChipId()).ifPresent(c -> report.setChipName(c.getName()));
        }
        if (report.getPlanId() != null) {
            planRepository.findById(report.getPlanId()).ifPresent(p -> report.setPlanName(p.getName()));
        }
        // #476: filter out high-score worst_operator from old reports
        filterBottleneckAnalysis(report);
    }

    private void enrichReports(java.util.List<ChipReport> reports) {
        reports.forEach(this::enrichReport);
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

    private double toDouble(Object val) {
        if (val == null) return 0;
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0; }
    }
}
