package com.lab.chipreport;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TDD tests for #440: Fix contradictory summary when all dimension scores are equal
 *
 * The bug: when all dimensions score 0.0 (or are equal), the same dimension
 * can appear as both "表现最佳" and "主要瓶颈" — a contradiction.
 *
 * These tests verify:
 * 1. buildBottleneckAnalysis: all-zero scores → no contradictory best/worst
 * 2. buildScenarioRecommendations: all-zero → no recommendations referencing best/worst
 * 3. buildCategorySummary: when best == worst operator, don't show both
 */
class ReportGeneratorServiceTest {

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
    }

    // ── buildBottleneckAnalysis tests ──

    @Test
    @DisplayName("#440: all-zero dim scores → no weak_dimension entries with score 0.0")
    void buildBottleneckAnalysis_allZero_noWeakDimensions() throws Exception {
        Map<String, Double> dimScores = new LinkedHashMap<>();
        dimScores.put("compute", 0.0);
        dimScores.put("memory", 0.0);
        dimScores.put("communication", 0.0);
        dimScores.put("op_compat", 0.0);
        dimScores.put("training", 0.0);
        dimScores.put("inference", 0.0);
        dimScores.put("scalability", 0.0);
        dimScores.put("ecosystem", 0.0);

        List<Map<String, Object>> operatorRanking = Collections.emptyList();

        List<Map<String, Object>> analysis = invokeBuildBottleneckAnalysis(dimScores, operatorRanking);

        // Should NOT generate weak_dimension entries for 0.0 scores (meaningless — no data)
        long weakDimCount = analysis.stream()
                .filter(a -> "weak_dimension".equals(a.get("type")))
                .count();
        assertEquals(0, weakDimCount,
                "All-zero scores should not generate 'weak_dimension' entries — it's no data, not weakness");

        // Should NOT have comm_bottleneck or ecosystem_gap for zero scores
        long commBottleneck = analysis.stream()
                .filter(a -> "comm_bottleneck".equals(a.get("type")))
                .count();
        assertEquals(0, commBottleneck,
                "All-zero scores should not generate comm_bottleneck");

        long ecoGap = analysis.stream()
                .filter(a -> "ecosystem_gap".equals(a.get("type")))
                .count();
        assertEquals(0, ecoGap,
                "All-zero scores should not generate ecosystem_gap");

        long effConcern = analysis.stream()
                .filter(a -> "efficiency_concern".equals(a.get("type")))
                .count();
        assertEquals(0, effConcern,
                "All-zero scores should not generate efficiency_concern");
    }

    @Test
    @DisplayName("#440: all equal non-zero scores → no contradictory analysis")
    void buildBottleneckAnalysis_allEqual_noContradiction() throws Exception {
        Map<String, Double> dimScores = new LinkedHashMap<>();
        dimScores.put("compute", 75.0);
        dimScores.put("memory", 75.0);
        dimScores.put("communication", 75.0);
        dimScores.put("op_compat", 75.0);
        dimScores.put("training", 75.0);
        dimScores.put("inference", 75.0);
        dimScores.put("scalability", 75.0);
        dimScores.put("ecosystem", 75.0);

        List<Map<String, Object>> analysis = invokeBuildBottleneckAnalysis(dimScores, Collections.emptyList());

        // No weak_dimension, no comm_bottleneck when all equal and above thresholds
        long weakDimCount = analysis.stream()
                .filter(a -> "weak_dimension".equals(a.get("type")))
                .count();
        assertEquals(0, weakDimCount, "All-equal 75 scores should not have weak dimensions");
    }

    @Test
    @DisplayName("#440: varied scores still correctly identify bottlenecks")
    void buildBottleneckAnalysis_variedScores_stillWorks() throws Exception {
        Map<String, Double> dimScores = new LinkedHashMap<>();
        dimScores.put("compute", 95.0);
        dimScores.put("memory", 30.0);  // weak
        dimScores.put("communication", 80.0);
        dimScores.put("op_compat", 85.0);
        dimScores.put("training", 90.0);
        dimScores.put("inference", 55.0); // weak
        dimScores.put("scalability", 75.0);
        dimScores.put("ecosystem", 70.0);

        List<Map<String, Object>> analysis = invokeBuildBottleneckAnalysis(dimScores, Collections.emptyList());

        // Should still detect actual weak dimensions
        long weakDimCount = analysis.stream()
                .filter(a -> "weak_dimension".equals(a.get("type")))
                .count();
        assertTrue(weakDimCount >= 2, "Should detect memory(30) and inference(55) as weak dimensions");
    }

    // ── buildScenarioRecommendations tests ──

    @Test
    @DisplayName("#440: all-zero scores → no 'recommended' scenarios")
    void buildScenarioRecommendations_allZero_noRecommendations() throws Exception {
        Map<String, Double> dimScores = new LinkedHashMap<>();
        dimScores.put("compute", 0.0);
        dimScores.put("memory", 0.0);
        dimScores.put("communication", 0.0);
        dimScores.put("op_compat", 0.0);
        dimScores.put("training", 0.0);
        dimScores.put("inference", 0.0);
        dimScores.put("scalability", 0.0);
        dimScores.put("ecosystem", 0.0);

        List<Map<String, Object>> recs = invokeBuildScenarioRecommendations(dimScores, 0.0);

        // With all-zero scores, there should be NO 'recommended' scenarios
        long recommendedCount = recs.stream()
                .filter(r -> "recommended".equals(r.get("type")))
                .count();
        assertEquals(0, recommendedCount,
                "All-zero scores should not generate any 'recommended' scenarios");

        // Should have a 'no_data' or 'unverified' entry instead
        boolean hasNoDataOrUnverified = recs.stream()
                .anyMatch(r -> "no_data".equals(r.get("type")) || "unverified".equals(r.get("type")));
        assertTrue(hasNoDataOrUnverified,
                "All-zero scores should generate 'no_data' or 'unverified' entries");
    }

    @Test
    @DisplayName("#440: all equal non-zero but low scores → only caution/unverified, no recommended")
    void buildScenarioRecommendations_allEqualLow_noBestWorstConfusion() throws Exception {
        Map<String, Double> dimScores = new LinkedHashMap<>();
        dimScores.put("compute", 50.0);
        dimScores.put("memory", 50.0);
        dimScores.put("communication", 50.0);
        dimScores.put("op_compat", 50.0);
        dimScores.put("training", 50.0);
        dimScores.put("inference", 50.0);
        dimScores.put("scalability", 50.0);
        dimScores.put("ecosystem", 50.0);

        List<Map<String, Object>> recs = invokeBuildScenarioRecommendations(dimScores, 50.0);

        // All 50 -> no "recommended"
        long recommendedCount = recs.stream()
                .filter(r -> "recommended".equals(r.get("type")))
                .count();
        assertEquals(0, recommendedCount,
                "All-50 scores should not generate 'recommended' scenarios");
    }

    // ── buildCategorySummary tests ──

    @Test
    @DisplayName("#440: single operator → bestOperator set, worstOperator NOT set (same entity)")
    void buildCategorySummary_singleOperator_noBestWorstConflict() throws Exception {
        List<Map<String, Object>> operatorRanking = new ArrayList<>();
        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("testItem", "MatMul");
        op1.put("dimension", "训练");
        op1.put("score", 75.0);
        op1.put("latencyMean", 0.5);
        op1.put("throughput", 100.0);
        op1.put("dataStatus", "VALID");
        operatorRanking.add(op1);

        Map<String, Object> summary = invokeBuildCategorySummary(operatorRanking, "训练", 75.0);

        // bestOperator and worstOperator should NOT both be "MatMul"
        String best = (String) summary.get("bestOperator");
        String worst = (String) summary.get("worstOperator");
        assertFalse(best != null && best.equals(worst),
                "Best and worst should not be the same operator: " + best);
    }

    @Test
    @DisplayName("#440: two operators with same score → no contradictory best/worst")
    void buildCategorySummary_sameScoreOperators_noContradiction() throws Exception {
        List<Map<String, Object>> operatorRanking = new ArrayList<>();
        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("testItem", "Backward");
        op1.put("dimension", "训练");
        op1.put("score", 0.0);
        op1.put("latencyMean", 0.0);
        op1.put("throughput", 0.0);
        op1.put("dataStatus", "VALID");
        operatorRanking.add(op1);

        Map<String, Object> op2 = new LinkedHashMap<>();
        op2.put("testItem", "Gradient");
        op2.put("dimension", "训练");
        op2.put("score", 0.0);
        op2.put("latencyMean", 0.0);
        op2.put("throughput", 0.0);
        op2.put("dataStatus", "VALID");
        operatorRanking.add(op2);

        Map<String, Object> summary = invokeBuildCategorySummary(operatorRanking, "训练", 0.0);

        String best = (String) summary.get("bestOperator");
        String worst = (String) summary.get("worstOperator");

        // When all scores are 0, should not show both best and worst
        if (best != null && worst != null) {
            assertNotEquals(best, worst,
                    "When all scores are the same, best and worst should not be the same");
        }
    }

    @Test
    @DisplayName("#440: distinct best and worst operators still shown correctly")
    void buildCategorySummary_distinctBestWorst_stillWorks() throws Exception {
        List<Map<String, Object>> operatorRanking = new ArrayList<>();
        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("testItem", "Attention");
        op1.put("dimension", "推理");
        op1.put("score", 95.0);
        op1.put("latencyMean", 0.5);
        op1.put("throughput", 200.0);
        op1.put("dataStatus", "VALID");
        operatorRanking.add(op1);

        Map<String, Object> op2 = new LinkedHashMap<>();
        op2.put("testItem", "MLP");
        op2.put("dimension", "推理");
        op2.put("score", 40.0);
        op2.put("latencyMean", 2.0);
        op2.put("throughput", 50.0);
        op2.put("dataStatus", "VALID");
        operatorRanking.add(op2);

        Map<String, Object> summary = invokeBuildCategorySummary(operatorRanking, "推理", 67.5);

        assertEquals("Attention", summary.get("bestOperator"));
        assertEquals("MLP", summary.get("worstOperator"));
    }

    // ── Helper: invoke private methods via reflection ──

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> invokeBuildBottleneckAnalysis(
            Map<String, Double> dimScores, List<Map<String, Object>> operatorRanking) throws Exception {
        ReportGeneratorService service = createServiceWithMinimalDeps();
        Method method = ReportGeneratorService.class.getDeclaredMethod(
                "buildBottleneckAnalysis", Map.class, List.class);
        method.setAccessible(true);
        return (List<Map<String, Object>>) method.invoke(service, dimScores, operatorRanking);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> invokeBuildScenarioRecommendations(
            Map<String, Double> dimScores, double overallScore) throws Exception {
        ReportGeneratorService service = createServiceWithMinimalDeps();
        Method method = ReportGeneratorService.class.getDeclaredMethod(
                "buildScenarioRecommendations", Map.class, double.class);
        method.setAccessible(true);
        return (List<Map<String, Object>>) method.invoke(service, dimScores, overallScore);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> invokeBuildCategorySummary(
            List<Map<String, Object>> operatorRanking, String dimension, double dimensionScore) throws Exception {
        ReportGeneratorService service = createServiceWithMinimalDeps();
        Method method = ReportGeneratorService.class.getDeclaredMethod(
                "buildCategorySummary", List.class, String.class, double.class);
        method.setAccessible(true);
        return (Map<String, Object>) method.invoke(service, operatorRanking, dimension, dimensionScore);
    }

    private ReportGeneratorService createServiceWithMinimalDeps() {
        // These methods don't use any injected dependencies, so pass nulls
        return new ReportGeneratorService(null, null, null, null, null, null, new ObjectMapper(), null, null, null, null);
    }

    // ── #470: Score-100 operators should NOT be labeled "低性能算子" ──

    @Test
    @DisplayName("#470: all operators score=100 → no worst_operator in bottleneck")
    void buildBottleneckAnalysis_allScore100_noWorstOperator() throws Exception {
        Map<String, Double> dimScores = Map.of("compute", 100.0, "memory", 100.0);
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        for (String name : List.of("MatMul", "Conv2D", "Softmax")) {
            Map<String, Object> op = new LinkedHashMap<>();
            op.put("name", name);
            op.put("testItem", name);
            op.put("score", 100.0);
            op.put("avgLatency", 0.5);
            op.put("throughput", 1000.0);
            op.put("dataStatus", "VALID");
            operatorRanking.add(op);
        }

        List<Map<String, Object>> analysis = invokeBuildBottleneckAnalysis(dimScores, operatorRanking);

        long worstOpCount = analysis.stream()
                .filter(a -> "worst_operator".equals(a.get("type")))
                .count();
        assertEquals(0, worstOpCount,
                "Operators with score=100 should NOT appear as worst_operator bottlenecks");
    }

    @Test
    @DisplayName("#470: operator score=40 → labeled 低性能算子 with level=error")
    void buildBottleneckAnalysis_score40_lowPerformanceError() throws Exception {
        Map<String, Double> dimScores = Map.of("compute", 50.0);
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        Map<String, Object> op = new LinkedHashMap<>();
        op.put("name", "SlowOp");
        op.put("testItem", "SlowOp");
        op.put("score", 40.0);
        op.put("avgLatency", 10.0);
        op.put("throughput", 50.0);
        op.put("dataStatus", "VALID");
        operatorRanking.add(op);

        List<Map<String, Object>> analysis = invokeBuildBottleneckAnalysis(dimScores, operatorRanking);

        List<Map<String, Object>> worstOps = analysis.stream()
                .filter(a -> "worst_operator".equals(a.get("type")))
                .toList();
        assertEquals(1, worstOps.size(), "Should have 1 worst_operator entry for score=40");

        Map<String, Object> entry = worstOps.get(0);
        assertTrue(((String) entry.get("title")).contains("低性能算子"),
                "Score<70 should be labeled as 低性能算子");
        assertEquals("error", entry.get("level"),
                "Score<50 should have level=error");
    }

    @Test
    @DisplayName("#470: operator score=65 → labeled 低性能算子 with level=warning")
    void buildBottleneckAnalysis_score65_lowPerformanceWarning() throws Exception {
        Map<String, Double> dimScores = Map.of("compute", 65.0);
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        Map<String, Object> op = new LinkedHashMap<>();
        op.put("name", "MedOp");
        op.put("testItem", "MedOp");
        op.put("score", 65.0);
        op.put("avgLatency", 5.0);
        op.put("throughput", 100.0);
        op.put("dataStatus", "VALID");
        operatorRanking.add(op);

        List<Map<String, Object>> analysis = invokeBuildBottleneckAnalysis(dimScores, operatorRanking);

        List<Map<String, Object>> worstOps = analysis.stream()
                .filter(a -> "worst_operator".equals(a.get("type")))
                .toList();
        assertEquals(1, worstOps.size(), "Should have 1 worst_operator entry for score=65");

        Map<String, Object> entry = worstOps.get(0);
        assertTrue(((String) entry.get("title")).contains("低性能算子"),
                "Score 50-70 should be labeled as 低性能算子");
        assertEquals("warning", entry.get("level"),
                "Score 50-70 should have level=warning");
    }

    @Test
    @DisplayName("#470: operator score=75 → labeled 中等性能算子 with level=info")
    void buildBottleneckAnalysis_score75_mediumPerformanceInfo() throws Exception {
        Map<String, Double> dimScores = Map.of("compute", 75.0);
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        Map<String, Object> op = new LinkedHashMap<>();
        op.put("name", "OkOp");
        op.put("testItem", "OkOp");
        op.put("score", 75.0);
        op.put("avgLatency", 3.0);
        op.put("throughput", 150.0);
        op.put("dataStatus", "VALID");
        operatorRanking.add(op);

        List<Map<String, Object>> analysis = invokeBuildBottleneckAnalysis(dimScores, operatorRanking);

        List<Map<String, Object>> worstOps = analysis.stream()
                .filter(a -> "worst_operator".equals(a.get("type")))
                .toList();
        assertEquals(1, worstOps.size(), "Score 70-85 should still appear as worst_operator");

        Map<String, Object> entry = worstOps.get(0);
        assertTrue(((String) entry.get("title")).contains("中等性能算子"),
                "Score 70-85 should be labeled as 中等性能算子");
        assertEquals("info", entry.get("level"),
                "Score 70-85 should have level=info");
    }

    @Test
    @DisplayName("#470: operator score=90 → not in bottleneck analysis at all")
    void buildBottleneckAnalysis_score90_notInBottleneck() throws Exception {
        Map<String, Double> dimScores = Map.of("compute", 90.0);
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        Map<String, Object> op = new LinkedHashMap<>();
        op.put("name", "FastOp");
        op.put("testItem", "FastOp");
        op.put("score", 90.0);
        op.put("avgLatency", 1.0);
        op.put("throughput", 500.0);
        op.put("dataStatus", "VALID");
        operatorRanking.add(op);

        List<Map<String, Object>> analysis = invokeBuildBottleneckAnalysis(dimScores, operatorRanking);

        long worstOpCount = analysis.stream()
                .filter(a -> "worst_operator".equals(a.get("type")))
                .count();
        assertEquals(0, worstOpCount,
                "Operators with score>=85 should NOT appear in bottleneck analysis");
    }

    @Test
    @DisplayName("#470: mixed scores → only sub-85 operators appear as bottlenecks")
    void buildBottleneckAnalysis_mixedScores_onlySub85InBottleneck() throws Exception {
        Map<String, Double> dimScores = Map.of("compute", 70.0);
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        // score=95 should NOT appear
        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("name", "Fast"); op1.put("testItem", "Fast");
        op1.put("score", 95.0); op1.put("avgLatency", 0.5);
        op1.put("throughput", 1000.0); op1.put("dataStatus", "VALID");
        operatorRanking.add(op1);

        // score=60 should appear as 低性能
        Map<String, Object> op2 = new LinkedHashMap<>();
        op2.put("name", "Slow"); op2.put("testItem", "Slow");
        op2.put("score", 60.0); op2.put("avgLatency", 8.0);
        op2.put("throughput", 60.0); op2.put("dataStatus", "VALID");
        operatorRanking.add(op2);

        // score=80 should appear as 中等性能
        Map<String, Object> op3 = new LinkedHashMap<>();
        op3.put("name", "Medium"); op3.put("testItem", "Medium");
        op3.put("score", 80.0); op3.put("avgLatency", 3.0);
        op3.put("throughput", 200.0); op3.put("dataStatus", "VALID");
        operatorRanking.add(op3);

        List<Map<String, Object>> analysis = invokeBuildBottleneckAnalysis(dimScores, operatorRanking);

        List<Map<String, Object>> worstOps = analysis.stream()
                .filter(a -> "worst_operator".equals(a.get("type")))
                .toList();
        assertEquals(2, worstOps.size(), "Only score<85 operators should be in bottleneck");

        // Verify "Fast" (95) is NOT present
        boolean hasFast = worstOps.stream()
                .anyMatch(a -> "Fast".equals(a.get("operator")));
        assertFalse(hasFast, "Score=95 operator should not be in bottleneck");
    }
}
