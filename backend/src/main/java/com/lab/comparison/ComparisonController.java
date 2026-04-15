package com.lab.comparison;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.chipreport.ChipReport;
import com.lab.chipreport.ChipReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * #444 #445: Report Comparison REST API
 * POST /api/comparisons — create a new comparison
 * GET  /api/comparisons/{id} — retrieve a saved comparison
 */
@Slf4j
@RestController
@RequestMapping("/api/comparisons")
@RequiredArgsConstructor
public class ComparisonController {

    private final ComparisonService comparisonService;
    private final ComparisonResultRepository comparisonResultRepository;
    private final ChipReportRepository chipReportRepository;
    private final ObjectMapper objectMapper;

    /**
     * Create a new report comparison.
     * Request body: { "baselineReportId": 1, "testReportIds": [2, 3] }
     */
    @PostMapping
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> createComparison(
            @RequestBody Map<String, Object> request,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        try {
            Long baselineId = toLong(request.get("baselineReportId"));
            List<Long> testIds = toListOfLong(request.get("testReportIds"));

            if (baselineId == null || testIds == null || testIds.isEmpty()) {
                return ResponseEntity.badRequest().body(error("baselineReportId and testReportIds are required"));
            }
            if (testIds.size() > 4) {
                return ResponseEntity.badRequest().body(error("Maximum 4 test reports (5 total including baseline)"));
            }

            // Load baseline report
            Optional<ChipReport> baselineOpt = chipReportRepository.findById(baselineId);
            if (baselineOpt.isEmpty()) {
                return ResponseEntity.badRequest().body(error("Baseline report not found: " + baselineId));
            }
            ChipReport baseline = baselineOpt.get();
            List<Map<String, Object>> baselineOps = parseOperatorRanking(baseline.getOperatorRanking());

            // Process each test report
            List<Map<String, Object>> perReportResults = new ArrayList<>();
            for (Long testId : testIds) {
                Optional<ChipReport> testOpt = chipReportRepository.findById(testId);
                if (testOpt.isEmpty()) {
                    return ResponseEntity.badRequest().body(error("Test report not found: " + testId));
                }
                ChipReport testReport = testOpt.get();
                List<Map<String, Object>> testOps = parseOperatorRanking(testReport.getOperatorRanking());

                Map<String, Object> reportResult = buildReportComparison(
                        baselineOps, testOps, baselineId, testId);
                perReportResults.add(reportResult);
            }

            // Persist
            ComparisonResult entity = new ComparisonResult();
            entity.setBaselineReportId(baselineId);
            entity.setTestReportIds(testIds.stream().map(String::valueOf).collect(Collectors.joining(",")));
            entity.setOperatorComparisons(objectMapper.writeValueAsString(perReportResults));

            // Extract first test's overall for top-level field
            if (!perReportResults.isEmpty()) {
                Object overall = perReportResults.get(0).get("overallVsPct");
                if (overall instanceof Number) {
                    entity.setOverallVsPct(((Number) overall).doubleValue());
                }
                Object dimPcts = perReportResults.get(0).get("dimensionVsPcts");
                if (dimPcts != null) {
                    entity.setDimensionVsPcts(objectMapper.writeValueAsString(dimPcts));
                }
            }

            if (userId != null) entity.setCreatedBy(userId);
            ComparisonResult saved = comparisonResultRepository.save(entity);
            log.info("#444 Comparison created: id={}, baseline={}, tests={}", saved.getId(), baselineId, testIds);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", saved.getId());
            result.put("baselineReportId", baselineId);
            result.put("testReportIds", testIds);
            result.put("reports", perReportResults);
            result.put("createdAt", saved.getCreatedAt());

            return ResponseEntity.ok(success(result));
        } catch (Exception e) {
            log.error("#444 Comparison creation failed", e);
            return ResponseEntity.internalServerError().body(error("Comparison failed: " + e.getMessage()));
        }
    }

    /**
     * Retrieve a saved comparison by ID.
     */
    @GetMapping("/{id}")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getComparison(@PathVariable Long id) {
        try {
            Optional<ComparisonResult> opt = comparisonResultRepository.findById(id);
            if (opt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            ComparisonResult cr = opt.get();

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", cr.getId());
            result.put("baselineReportId", cr.getBaselineReportId());
            result.put("testReportIds", cr.getTestReportIds());
            result.put("overallVsPct", cr.getOverallVsPct());
            result.put("dimensionVsPcts", cr.getDimensionVsPcts() != null
                    ? objectMapper.readValue(cr.getDimensionVsPcts(), new TypeReference<Map<String, Double>>() {})
                    : null);
            result.put("reports", cr.getOperatorComparisons() != null
                    ? objectMapper.readValue(cr.getOperatorComparisons(), new TypeReference<List<Map<String, Object>>>() {})
                    : null);
            result.put("summary", cr.getSummary());
            result.put("createdAt", cr.getCreatedAt());

            return ResponseEntity.ok(success(result));
        } catch (Exception e) {
            log.error("#444 Get comparison failed", e);
            return ResponseEntity.internalServerError().body(error("Failed to retrieve comparison: " + e.getMessage()));
        }
    }

    // ── Internal comparison logic ──

    private Map<String, Object> buildReportComparison(
            List<Map<String, Object>> baselineOps,
            List<Map<String, Object>> testOps,
            Long baselineId, Long testId) {

        // 1. Operator-level comparisons
        List<Map<String, Object>> operatorComparisons = buildOperatorComparisons(baselineOps, testOps);

        // 2. Dimension-level vs%
        String[] dimensions = {"compute", "memory", "communication", "op_compat",
                "training", "inference", "scalability", "ecosystem"};
        Map<String, Double> dimensionVsPcts = new LinkedHashMap<>();
        for (String dim : dimensions) {
            // Filter ops by dimension mapping
            List<Map<String, Object>> blDimOps = filterByDimension(baselineOps, dim);
            List<Map<String, Object>> tsDimOps = filterByDimension(testOps, dim);
            Double dimPct = comparisonService.calcDimensionVsPct(dim, blDimOps, tsDimOps);
            dimensionVsPcts.put(dim, dimPct);
        }

        // 3. Overall vs%
        Double overallVsPct = comparisonService.calcOverallVsPct(dimensionVsPcts);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("baselineReportId", baselineId);
        result.put("testReportId", testId);
        result.put("overallVsPct", overallVsPct);
        result.put("dimensionVsPcts", dimensionVsPcts);
        result.put("operatorComparisons", operatorComparisons);
        return result;
    }

    private List<Map<String, Object>> buildOperatorComparisons(
            List<Map<String, Object>> baselineOps,
            List<Map<String, Object>> testOps) {
        // Index by testItem
        Map<String, Map<String, Object>> baselineIndex = new LinkedHashMap<>();
        for (Map<String, Object> op : baselineOps) {
            String item = String.valueOf(op.get("testItem"));
            baselineIndex.put(item, op);
        }
        Map<String, Map<String, Object>> testIndex = new LinkedHashMap<>();
        for (Map<String, Object> op : testOps) {
            String item = String.valueOf(op.get("testItem"));
            testIndex.put(item, op);
        }

        // Common operators
        Set<String> common = new LinkedHashSet<>(baselineIndex.keySet());
        common.retainAll(testIndex.keySet());

        List<Map<String, Object>> comparisons = new ArrayList<>();
        String[] metricKeys = {"latencyMean", "latencyP95", "latencyP99", "throughput",
                "busBandwidth", "memBandwidth", "gflops"};

        for (String item : common) {
            Map<String, Object> blOp = baselineIndex.get(item);
            Map<String, Object> tsOp = testIndex.get(item);
            Map<String, Object> comp = new LinkedHashMap<>();
            comp.put("testItem", item);
            comp.put("dimension", blOp.get("dimension"));

            Map<String, Object> metrics = new LinkedHashMap<>();
            for (String metricKey : metricKeys) {
                Object blVal = blOp.get(metricKey);
                Object tsVal = tsOp.get(metricKey);
                if (blVal == null && tsVal == null) continue;

                String direction = ComparisonService.getMetricDirection(metricKey);
                Double blDouble = toDouble(blVal);
                Double tsDouble = toDouble(tsVal);
                Double vsPct = (blDouble != null && tsDouble != null)
                        ? ComparisonService.calcVsPct(direction, blDouble, tsDouble) : null;

                Map<String, Object> metricDetail = new LinkedHashMap<>();
                metricDetail.put("baseline", blDouble);
                metricDetail.put("test", tsDouble);
                metricDetail.put("vsPct", vsPct != null ? Math.round(vsPct * 100.0) / 100.0 : null);
                metricDetail.put("direction", direction);
                metrics.put(metricKey, metricDetail);
            }
            comp.put("metrics", metrics);
            comparisons.add(comp);
        }
        return comparisons;
    }

    // ── Dimension mapping ──

    private static final Map<String, List<String>> DIMENSION_LABELS = Map.of(
        "compute", List.of("计算", "compute"),
        "memory", List.of("访存", "memory"),
        "communication", List.of("通信", "communication"),
        "op_compat", List.of("算子兼容", "op_compat"),
        "training", List.of("训练", "training"),
        "inference", List.of("推理", "inference"),
        "scalability", List.of("扩展性", "scalability"),
        "ecosystem", List.of("生态", "ecosystem")
    );

    private List<Map<String, Object>> filterByDimension(List<Map<String, Object>> ops, String dimKey) {
        List<String> labels = DIMENSION_LABELS.getOrDefault(dimKey, List.of(dimKey));
        return ops.stream()
                .filter(op -> {
                    Object dim = op.get("dimension");
                    if (dim == null) return false;
                    String dimStr = dim.toString();
                    return labels.stream().anyMatch(l -> l.equalsIgnoreCase(dimStr));
                })
                .collect(Collectors.toList());
    }

    // ── Helpers ──

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseOperatorRanking(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            log.warn("Failed to parse operatorRanking JSON", e);
            return List.of();
        }
    }

    private Long toLong(Object val) {
        if (val == null) return null;
        if (val instanceof Number) return ((Number) val).longValue();
        try { return Long.parseLong(val.toString()); } catch (Exception e) { return null; }
    }

    @SuppressWarnings("unchecked")
    private List<Long> toListOfLong(Object val) {
        if (val == null) return null;
        if (val instanceof List) {
            return ((List<Object>) val).stream()
                    .map(this::toLong)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());
        }
        return null;
    }

    private Double toDouble(Object val) {
        if (val == null) return null;
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return null; }
    }

    private Map<String, Object> success(Object data) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("success", true);
        r.put("data", data);
        return r;
    }

    private Map<String, Object> error(String message) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("success", false);
        r.put("message", message);
        return r;
    }
}
