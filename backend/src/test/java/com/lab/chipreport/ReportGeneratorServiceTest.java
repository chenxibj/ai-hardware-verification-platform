package com.lab.chipreport;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TDD tests for #440: Fix contradictory summary when all dimension scores are equal
 * #543: Updated - analysis methods now on ReportDataAssembler (public, no reflection)
 */
class ReportGeneratorServiceTest {

    private ObjectMapper objectMapper;
    private ReportDataAssembler assembler;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        assembler = new ReportDataAssembler(objectMapper, null, null, null);
    }

    // -- buildBottleneckAnalysis tests --

    @Test
    @DisplayName("#440: all-zero dim scores -> no weak_dimension entries with score 0.0")
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

        List<Map<String, Object>> analysis = assembler.buildBottleneckAnalysis(dimScores, operatorRanking);

        long weakDimCount = analysis.stream()
                .filter(a -> "weak_dimension".equals(a.get("type")))
                .count();
        assertEquals(0, weakDimCount,
                "All-zero scores should not generate 'weak_dimension' entries");

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
    @DisplayName("#440: all equal non-zero scores -> no contradictory analysis")
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

        List<Map<String, Object>> analysis = assembler.buildBottleneckAnalysis(dimScores, Collections.emptyList());

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
        dimScores.put("memory", 30.0);
        dimScores.put("communication", 80.0);
        dimScores.put("op_compat", 85.0);
        dimScores.put("training", 90.0);
        dimScores.put("inference", 55.0);
        dimScores.put("scalability", 75.0);
        dimScores.put("ecosystem", 70.0);

        List<Map<String, Object>> analysis = assembler.buildBottleneckAnalysis(dimScores, Collections.emptyList());

        long weakDimCount = analysis.stream()
                .filter(a -> "weak_dimension".equals(a.get("type")))
                .count();
        assertTrue(weakDimCount >= 2, "Should detect memory(30) and inference(55) as weak dimensions");
    }

    // -- buildScenarioRecommendations tests --

    @Test
    @DisplayName("#440: all-zero scores -> no 'recommended' scenarios")
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

        List<Map<String, Object>> recs = assembler.buildScenarioRecommendations(dimScores, 0.0);

        long recommendedCount = recs.stream()
                .filter(r -> "recommended".equals(r.get("type")))
                .count();
        assertEquals(0, recommendedCount,
                "All-zero scores should not generate any 'recommended' scenarios");

        boolean hasNoDataOrUnverified = recs.stream()
                .anyMatch(r -> "no_data".equals(r.get("type")) || "unverified".equals(r.get("type")));
        assertTrue(hasNoDataOrUnverified,
                "All-zero scores should generate 'no_data' or 'unverified' entries");
    }

    @Test
    @DisplayName("#440: all equal non-zero but low scores -> only caution/unverified")
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

        List<Map<String, Object>> recs = assembler.buildScenarioRecommendations(dimScores, 50.0);

        long recommendedCount = recs.stream()
                .filter(r -> "recommended".equals(r.get("type")))
                .count();
        assertEquals(0, recommendedCount,
                "All-50 scores should not generate 'recommended' scenarios");
    }

    // -- buildCategorySummary tests --

    @Test
    @DisplayName("#440: single operator -> no best/worst conflict")
    void buildCategorySummary_singleOperator_noBestWorstConflict() throws Exception {
        List<Map<String, Object>> operatorRanking = new ArrayList<>();
        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("testItem", "MatMul");
        op1.put("dimension", "training");
        op1.put("score", 75.0);
        op1.put("latencyMean", 0.5);
        op1.put("throughput", 100.0);
        op1.put("dataStatus", "VALID");
        operatorRanking.add(op1);

        Map<String, Object> summary = assembler.buildCategorySummary(operatorRanking, "training", 75.0);

        String best = (String) summary.get("bestOperator");
        String worst = (String) summary.get("worstOperator");
        assertFalse(best != null && best.equals(worst),
                "Best and worst should not be the same operator: " + best);
    }

    @Test
    @DisplayName("#440: two operators same score -> no contradictory best/worst")
    void buildCategorySummary_sameScoreOperators_noContradiction() throws Exception {
        List<Map<String, Object>> operatorRanking = new ArrayList<>();
        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("testItem", "Backward");
        op1.put("dimension", "training");
        op1.put("score", 0.0);
        op1.put("latencyMean", 0.0);
        op1.put("throughput", 0.0);
        op1.put("dataStatus", "VALID");
        operatorRanking.add(op1);

        Map<String, Object> op2 = new LinkedHashMap<>();
        op2.put("testItem", "Gradient");
        op2.put("dimension", "training");
        op2.put("score", 0.0);
        op2.put("latencyMean", 0.0);
        op2.put("throughput", 0.0);
        op2.put("dataStatus", "VALID");
        operatorRanking.add(op2);

        Map<String, Object> summary = assembler.buildCategorySummary(operatorRanking, "training", 0.0);

        String best = (String) summary.get("bestOperator");
        String worst = (String) summary.get("worstOperator");

        if (best != null && worst != null) {
            assertNotEquals(best, worst,
                    "When all scores are the same, best and worst should not be the same");
        }
    }

    @Test
    @DisplayName("#440: distinct best and worst still shown correctly")
    void buildCategorySummary_distinctBestWorst_stillWorks() throws Exception {
        List<Map<String, Object>> operatorRanking = new ArrayList<>();
        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("testItem", "Attention");
        op1.put("dimension", "inference");
        op1.put("score", 95.0);
        op1.put("latencyMean", 0.5);
        op1.put("throughput", 200.0);
        op1.put("dataStatus", "VALID");
        operatorRanking.add(op1);

        Map<String, Object> op2 = new LinkedHashMap<>();
        op2.put("testItem", "MLP");
        op2.put("dimension", "inference");
        op2.put("score", 40.0);
        op2.put("latencyMean", 2.0);
        op2.put("throughput", 50.0);
        op2.put("dataStatus", "VALID");
        operatorRanking.add(op2);

        Map<String, Object> summary = assembler.buildCategorySummary(operatorRanking, "inference", 67.5);

        assertEquals("Attention", summary.get("bestOperator"));
        assertEquals("MLP", summary.get("worstOperator"));
    }

    // -- #470: Score thresholds --

    @Test
    @DisplayName("#470: all operators score=100 -> no worst_operator in bottleneck")
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

        List<Map<String, Object>> analysis = assembler.buildBottleneckAnalysis(dimScores, operatorRanking);

        long worstOpCount = analysis.stream()
                .filter(a -> "worst_operator".equals(a.get("type")))
                .count();
        assertEquals(0, worstOpCount,
                "Operators with score=100 should NOT appear as worst_operator bottlenecks");
    }

    @Test
    @DisplayName("#470: operator score=40 -> error level")
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

        List<Map<String, Object>> analysis = assembler.buildBottleneckAnalysis(dimScores, operatorRanking);

        List<Map<String, Object>> worstOps = analysis.stream()
                .filter(a -> "worst_operator".equals(a.get("type")))
                .toList();
        assertEquals(1, worstOps.size());

        Map<String, Object> entry = worstOps.get(0);
        assertTrue(((String) entry.get("title")).contains("低性能算子"));
        assertEquals("error", entry.get("level"));
    }

    @Test
    @DisplayName("#470: operator score=65 -> warning level")
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

        List<Map<String, Object>> analysis = assembler.buildBottleneckAnalysis(dimScores, operatorRanking);

        List<Map<String, Object>> worstOps = analysis.stream()
                .filter(a -> "worst_operator".equals(a.get("type")))
                .toList();
        assertEquals(1, worstOps.size());

        Map<String, Object> entry = worstOps.get(0);
        assertTrue(((String) entry.get("title")).contains("低性能算子"));
        assertEquals("warning", entry.get("level"));
    }

    @Test
    @DisplayName("#470: operator score=75 -> info level, medium performance")
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

        List<Map<String, Object>> analysis = assembler.buildBottleneckAnalysis(dimScores, operatorRanking);

        List<Map<String, Object>> worstOps = analysis.stream()
                .filter(a -> "worst_operator".equals(a.get("type")))
                .toList();
        assertEquals(1, worstOps.size());

        Map<String, Object> entry = worstOps.get(0);
        assertTrue(((String) entry.get("title")).contains("中等性能算子"));
        assertEquals("info", entry.get("level"));
    }

    @Test
    @DisplayName("#470: operator score=90 -> not in bottleneck")
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

        List<Map<String, Object>> analysis = assembler.buildBottleneckAnalysis(dimScores, operatorRanking);

        long worstOpCount = analysis.stream()
                .filter(a -> "worst_operator".equals(a.get("type")))
                .count();
        assertEquals(0, worstOpCount,
                "Operators with score>=85 should NOT appear in bottleneck analysis");
    }

    @Test
    @DisplayName("#470: mixed scores -> only sub-85 in bottleneck")
    void buildBottleneckAnalysis_mixedScores_onlySub85InBottleneck() throws Exception {
        Map<String, Double> dimScores = Map.of("compute", 70.0);
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("name", "Fast"); op1.put("testItem", "Fast");
        op1.put("score", 95.0); op1.put("avgLatency", 0.5);
        op1.put("throughput", 1000.0); op1.put("dataStatus", "VALID");
        operatorRanking.add(op1);

        Map<String, Object> op2 = new LinkedHashMap<>();
        op2.put("name", "Slow"); op2.put("testItem", "Slow");
        op2.put("score", 60.0); op2.put("avgLatency", 8.0);
        op2.put("throughput", 60.0); op2.put("dataStatus", "VALID");
        operatorRanking.add(op2);

        Map<String, Object> op3 = new LinkedHashMap<>();
        op3.put("name", "Medium"); op3.put("testItem", "Medium");
        op3.put("score", 80.0); op3.put("avgLatency", 3.0);
        op3.put("throughput", 200.0); op3.put("dataStatus", "VALID");
        operatorRanking.add(op3);

        List<Map<String, Object>> analysis = assembler.buildBottleneckAnalysis(dimScores, operatorRanking);

        List<Map<String, Object>> worstOps = analysis.stream()
                .filter(a -> "worst_operator".equals(a.get("type")))
                .toList();
        assertEquals(2, worstOps.size(), "Only score<85 operators should be in bottleneck");

        boolean hasFast = worstOps.stream()
                .anyMatch(a -> "Fast".equals(a.get("operator")));
        assertFalse(hasFast, "Score=95 operator should not be in bottleneck");
    }
}
