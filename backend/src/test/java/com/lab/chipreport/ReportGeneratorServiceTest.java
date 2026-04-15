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
        return new ReportGeneratorService(null, null, null, null, null, null, new ObjectMapper(), null, null);
    }
}
