package com.lab.scoring;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.chipreport.ChipReport;
import com.lab.chipreport.ChipReportRepository;
import com.lab.common.ApiResponse;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * #378: Scoring and ranking endpoints
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class ScoreRankingController {

    private final ChipRepository chipRepository;
    private final ChipReportRepository reportRepository;
    private final EvaluationResultRepository resultRepository;
    private final EvaluationTaskRepository taskRepository;
    private final ScoringService scoringService;
    private final ObjectMapper objectMapper;

    /**
     * GET /scores — 所有芯片的评分概览
     */
    @GetMapping("/scores")
    @RequireRole(Role.VIEWER)
    public ApiResponse<Object> getAllScores() {
        List<Chip> chips = chipRepository.findAll();
        List<Map<String, Object>> scores = new ArrayList<>();

        for (Chip chip : chips) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("chipId", chip.getId());
            item.put("chipName", chip.getName());
            item.put("manufacturer", chip.getManufacturer());

            // Get latest baseline report for this chip
            List<ChipReport> reports = reportRepository.findByChipId(chip.getId());
            ChipReport baseline = reports.stream()
                    .filter(r -> Boolean.TRUE.equals(r.getIsBaseline()))
                    .findFirst()
                    .orElse(reports.isEmpty() ? null : reports.get(reports.size() - 1));

            if (baseline != null) {
                item.put("overallScore", baseline.getOverallScore());
                item.put("reportId", baseline.getId());
                item.put("reportNo", baseline.getReportNo());
                if (baseline.getDimensionScores() != null) {
                    try {
                        item.put("dimensions", objectMapper.readValue(baseline.getDimensionScores(), Map.class));
                    } catch (Exception ignored) {}
                }
            } else {
                item.put("overallScore", null);
                item.put("reportId", null);
            }

            scores.add(item);
        }

        return ApiResponse.ok(scores);
    }

    /**
     * GET /rankings — 芯片综合排名
     */
    @GetMapping("/rankings")
    @RequireRole(Role.VIEWER)
    public ApiResponse<Object> getRankings(
            @RequestParam(required = false) String dimension) {
        List<Chip> chips = chipRepository.findAll();
        List<Map<String, Object>> rankings = new ArrayList<>();

        for (Chip chip : chips) {
            List<ChipReport> reports = reportRepository.findByChipId(chip.getId());
            ChipReport baseline = reports.stream()
                    .filter(r -> Boolean.TRUE.equals(r.getIsBaseline()))
                    .findFirst()
                    .orElse(reports.isEmpty() ? null : reports.get(reports.size() - 1));

            if (baseline == null || baseline.getOverallScore() == null) continue;

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("chipId", chip.getId());
            item.put("chipName", chip.getName());
            item.put("manufacturer", chip.getManufacturer());
            item.put("overallScore", baseline.getOverallScore());
            item.put("reportNo", baseline.getReportNo());

            if (dimension != null && baseline.getDimensionScores() != null) {
                try {
                    Map<String, Object> dims = objectMapper.readValue(baseline.getDimensionScores(), Map.class);
                    item.put("dimensionScore", dims.get(dimension));
                } catch (Exception ignored) {}
            }

            rankings.add(item);
        }

        // Sort by overallScore descending
        if (dimension != null) {
            rankings.sort((a, b) -> {
                Double sa = toDouble(a.get("dimensionScore"));
                Double sb = toDouble(b.get("dimensionScore"));
                return Double.compare(sb, sa);
            });
        } else {
            rankings.sort((a, b) -> {
                Double sa = toDouble(a.get("overallScore"));
                Double sb = toDouble(b.get("overallScore"));
                return Double.compare(sb, sa);
            });
        }

        // Add rank
        for (int i = 0; i < rankings.size(); i++) {
            rankings.get(i).put("rank", i + 1);
        }

        return ApiResponse.ok(rankings);
    }

    /**
     * GET /chips/{chipId}/scores — 单个芯片的详细评分
     */
    @GetMapping("/chips/{chipId}/scores")
    @RequireRole(Role.VIEWER)
    public ApiResponse<Object> getChipScores(@PathVariable Long chipId) {
        Chip chip = chipRepository.findById(chipId).orElse(null);
        if (chip == null) {
            return ApiResponse.error(1004, "芯片不存在: " + chipId);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("chipId", chip.getId());
        result.put("chipName", chip.getName());

        List<ChipReport> reports = reportRepository.findByChipId(chipId);
        ChipReport baseline = reports.stream()
                .filter(r -> Boolean.TRUE.equals(r.getIsBaseline()))
                .findFirst()
                .orElse(reports.isEmpty() ? null : reports.get(reports.size() - 1));

        if (baseline != null) {
            result.put("overallScore", baseline.getOverallScore());
            result.put("reportId", baseline.getId());
            result.put("reportNo", baseline.getReportNo());

            if (baseline.getDimensionScores() != null) {
                try {
                    result.put("dimensions", objectMapper.readValue(baseline.getDimensionScores(), Map.class));
                } catch (Exception ignored) {}
            }

            if (baseline.getOperatorRanking() != null) {
                try {
                    result.put("operatorRanking", objectMapper.readValue(baseline.getOperatorRanking(), List.class));
                } catch (Exception ignored) {}
            }

            if (baseline.getRadarData() != null) {
                try {
                    result.put("radarData", objectMapper.readValue(baseline.getRadarData(), List.class));
                } catch (Exception ignored) {}
            }
        } else {
            result.put("overallScore", null);
            result.put("dimensions", new LinkedHashMap<>());
        }

        // Historical scores from all reports
        List<Map<String, Object>> history = new ArrayList<>();
        for (ChipReport r : reports) {
            Map<String, Object> h = new LinkedHashMap<>();
            h.put("reportId", r.getId());
            h.put("reportNo", r.getReportNo());
            h.put("overallScore", r.getOverallScore());
            h.put("createdAt", r.getCreatedAt() != null ? r.getCreatedAt().toString() : null);
            h.put("isBaseline", Boolean.TRUE.equals(r.getIsBaseline()));
            history.add(h);
        }
        result.put("history", history);

        return ApiResponse.ok(result);
    }

    private double toDouble(Object val) {
        if (val == null) return 0;
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0; }
    }
}
