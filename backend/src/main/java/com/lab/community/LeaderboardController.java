package com.lab.community;

import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.chipreport.ChipReport;
import com.lab.chipreport.ChipReportRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 社区评测榜单控制器 (#177 US-3.1)
 * GET /api/v1/community/leaderboard?type=overall|compute|inference|efficiency|compatibility
 */
@Slf4j
@RestController
@RequestMapping("/community")
@RequiredArgsConstructor
public class LeaderboardController {

    private final ChipReportRepository reportRepository;
    private final ChipRepository chipRepository;
    private final ObjectMapper objectMapper;

    @GetMapping("/leaderboard")
    public ResponseEntity<Map<String, Object>> getLeaderboard(
            @RequestParam(defaultValue = "overall") String type) {
        try {
            List<ChipReport> allReports = reportRepository.findAll();

            // Filter: PUBLISHED status and within 180 days
            Instant cutoff = Instant.now().minus(180, ChronoUnit.DAYS);
            List<ChipReport> reports = allReports.stream()
                    .filter(r -> r.getStatus() == ChipReport.ReportStatus.PUBLISHED
                                 || r.getStatus() == ChipReport.ReportStatus.DRAFT) // include DRAFT for now since we have limited data
                    .filter(r -> r.getCreatedAt() != null && r.getCreatedAt().isAfter(cutoff))
                    .collect(Collectors.toList());

            // Build chip lookup
            Map<Long, Chip> chipMap = new HashMap<>();
            chipRepository.findAll().forEach(c -> chipMap.put(c.getId(), c));

            List<Map<String, Object>> entries = new ArrayList<>();
            for (ChipReport report : reports) {
                Chip chip = chipMap.get(report.getChipId());
                if (chip == null) continue;

                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("reportId", report.getId());
                entry.put("chipId", chip.getId());
                entry.put("chipName", chip.getName());
                entry.put("manufacturer", chip.getManufacturer());
                entry.put("chipType", chip.getChipType().name());
                entry.put("overallScore", report.getOverallScore());
                entry.put("evaluatedAt", report.getCreatedAt());

                Double metricValue = extractMetric(report, type);
                entry.put("metricValue", metricValue);

                entries.add(entry);
            }

            // Sort by metricValue DESC
            entries.sort((a, b) -> {
                Double va = (Double) a.get("metricValue");
                Double vb = (Double) b.get("metricValue");
                if (va == null && vb == null) return 0;
                if (va == null) return 1;
                if (vb == null) return -1;
                return Double.compare(vb, va);
            });

            return ResponseEntity.ok(success(entries));
        } catch (Exception e) {
            log.error("Failed to get leaderboard", e);
            return ResponseEntity.ok(success(Collections.emptyList()));
        }
    }

    private Double extractMetric(ChipReport report, String type) {
        try {
            switch (type) {
                case "overall":
                    return report.getOverallScore();
                case "compute":
                    return extractFromDimensionScores(report, "fp16_tflops");
                case "inference":
                    return extractFromDimensionScores(report, "inference_qps");
                case "efficiency":
                    return extractFromDimensionScores(report, "tflops_per_watt");
                case "compatibility":
                    return extractFromDimensionScores(report, "accuracy_pass_rate");
                default:
                    return report.getOverallScore();
            }
        } catch (Exception e) {
            return report.getOverallScore();
        }
    }

    private Double extractFromDimensionScores(ChipReport report, String key) {
        try {
            String json = report.getDimensionScores();
            if (json == null || json.isEmpty()) return report.getOverallScore();
            JsonNode node = objectMapper.readTree(json);
            if (node.has(key)) return node.get(key).asDouble();
            // Try nested search
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                if (field.getValue().isObject() && field.getValue().has(key)) {
                    return field.getValue().get(key).asDouble();
                }
            }
            return report.getOverallScore();
        } catch (Exception e) {
            return report.getOverallScore();
        }
    }

    private Map<String, Object> success(Object data) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 0);
        resp.put("message", "success");
        resp.put("data", data);
        return resp;
    }
}
