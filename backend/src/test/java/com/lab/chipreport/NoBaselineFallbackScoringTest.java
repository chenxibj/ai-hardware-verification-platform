package com.lab.chipreport;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TDD tests for #549: Report scoring engine returns 0 when no baseline exists.
 *
 * Root cause: When no baseline data exists, scoreFromMetrics returns -1,
 * operator ranking entries get score=null, but toDouble(null) returns 0,
 * making the overall report score 0 instead of using fallback logic.
 *
 * Fix: Filter out null-score entries from average calculation and provide
 * a fallback scoring method for the no-baseline scenario.
 */
class NoBaselineFallbackScoringTest {

    // ===== Part 1: toDouble(null) behavior =====

    @Test
    @DisplayName("#549: toDouble(null) returns 0 — this is root cause of the 0-score bug")
    void toDouble_null_returns0_rootCause() {
        // This test documents the root cause behavior
        assertEquals(0.0, ReportDataAssembler.toDouble(null),
                "toDouble(null) returns 0, which pollutes averages");
    }

    // ===== Part 2: Overall score calculation should skip null-score entries =====

    @Test
    @DisplayName("#549: overall score should skip null-score (no-baseline) entries in average")
    void overallScore_shouldSkipNullScoreEntries() {
        // Simulate operator ranking with mix of scored and no-baseline entries
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        // Entry with valid score (has baseline)
        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("testItem", "MatMul");
        op1.put("score", 85.0);
        op1.put("dataStatus", "VALID");
        operatorRanking.add(op1);

        // Entry with null score (no baseline)
        Map<String, Object> op2 = new LinkedHashMap<>();
        op2.put("testItem", "CustomOp");
        op2.put("score", null);
        op2.put("dataStatus", "VALID");
        op2.put("noBaseline", true);
        operatorRanking.add(op2);

        // Bug reproduction: old logic includes null → 0 in average
        double buggyScore = operatorRanking.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus")))
                .mapToDouble(op -> ReportDataAssembler.toDouble(op.get("score")))
                .average().orElse(0);

        assertEquals(42.5, buggyScore, 0.1,
                "Bug reproduction: old logic averages 85 and 0 → 42.5");

        // Fixed logic: filter out null scores
        double fixedScore = ReportDataAssembler.calculateOverallScoreFromRanking(operatorRanking);

        assertEquals(85.0, fixedScore, 0.1,
                "Fixed logic should return 85 (only entry with actual score)");
    }

    @Test
    @DisplayName("#549: all entries have no baseline -> should use fallback, not return 0")
    void overallScore_allNoBaseline_shouldUseFallback() {
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("testItem", "MatMul");
        op1.put("score", null);
        op1.put("dataStatus", "VALID");
        op1.put("noBaseline", true);
        op1.put("latencyMean", 0.5);
        op1.put("throughput", 1000.0);
        operatorRanking.add(op1);

        Map<String, Object> op2 = new LinkedHashMap<>();
        op2.put("testItem", "Conv2D");
        op2.put("score", null);
        op2.put("dataStatus", "VALID");
        op2.put("noBaseline", true);
        op2.put("latencyMean", 1.2);
        op2.put("throughput", 500.0);
        operatorRanking.add(op2);

        double overallScore = ReportDataAssembler.calculateOverallScoreFromRanking(operatorRanking);

        assertTrue(overallScore > 0,
                "Overall score should be > 0 even without baseline, got: " + overallScore);
    }

    @Test
    @DisplayName("#549: FAILED and NO_DATA entries should not affect fallback score")
    void fallbackScoring_ignoresFailedAndNoData() {
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("testItem", "MatMul");
        op1.put("score", null);
        op1.put("dataStatus", "VALID");
        op1.put("noBaseline", true);
        op1.put("latencyMean", 0.5);
        op1.put("throughput", 1000.0);
        operatorRanking.add(op1);

        Map<String, Object> op2 = new LinkedHashMap<>();
        op2.put("testItem", "FailedOp");
        op2.put("score", null);
        op2.put("dataStatus", "FAILED");
        op2.put("latencyMean", 0.0);
        op2.put("throughput", 0.0);
        operatorRanking.add(op2);

        Map<String, Object> op3 = new LinkedHashMap<>();
        op3.put("testItem", "NoDataOp");
        op3.put("score", null);
        op3.put("dataStatus", "NO_DATA");
        operatorRanking.add(op3);

        double score = ReportDataAssembler.calculateOverallScoreFromRanking(operatorRanking);
        assertTrue(score > 0,
                "Fallback score should only consider VALID entries, not FAILED/NO_DATA");
    }

    @Test
    @DisplayName("#549: empty operator ranking should return 0")
    void overallScore_emptyRanking_returns0() {
        List<Map<String, Object>> operatorRanking = new ArrayList<>();
        double score = ReportDataAssembler.calculateOverallScoreFromRanking(operatorRanking);
        assertEquals(0.0, score, 0.01, "Empty ranking should return 0");
    }

    @Test
    @DisplayName("#549: all FAILED entries should return 0")
    void overallScore_allFailed_returns0() {
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("testItem", "FailedOp1");
        op1.put("score", 0.0);
        op1.put("dataStatus", "FAILED");
        operatorRanking.add(op1);

        Map<String, Object> op2 = new LinkedHashMap<>();
        op2.put("testItem", "FailedOp2");
        op2.put("score", null);
        op2.put("dataStatus", "NO_DATA");
        operatorRanking.add(op2);

        double score = ReportDataAssembler.calculateOverallScoreFromRanking(operatorRanking);
        assertEquals(0.0, score, 0.01, "All-failed ranking should return 0");
    }

    @Test
    @DisplayName("#549: fallback score is capped at 60 (signals 'unverified against baseline')")
    void fallbackScore_cappedAt60() {
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        // All VALID, no baseline - 100% pass rate → 60 score
        for (int i = 0; i < 10; i++) {
            Map<String, Object> op = new LinkedHashMap<>();
            op.put("testItem", "Op" + i);
            op.put("score", null);
            op.put("dataStatus", "VALID");
            op.put("noBaseline", true);
            op.put("latencyMean", 0.5);
            op.put("throughput", 1000.0);
            operatorRanking.add(op);
        }

        double score = ReportDataAssembler.calculateOverallScoreFromRanking(operatorRanking);
        assertTrue(score <= 60.0,
                "Fallback score should be capped at 60 (unverified), got: " + score);
        assertTrue(score > 0,
                "Fallback score should be > 0, got: " + score);
    }

    @Test
    @DisplayName("#549: mixed baseline and no-baseline should average only baseline scores")
    void mixedScoring_averagesOnlyBaselineScores() {
        List<Map<String, Object>> operatorRanking = new ArrayList<>();

        // Two entries with baseline scores
        Map<String, Object> op1 = new LinkedHashMap<>();
        op1.put("testItem", "MatMul");
        op1.put("score", 120.0);
        op1.put("dataStatus", "VALID");
        operatorRanking.add(op1);

        Map<String, Object> op2 = new LinkedHashMap<>();
        op2.put("testItem", "ReLU");
        op2.put("score", 80.0);
        op2.put("dataStatus", "VALID");
        operatorRanking.add(op2);

        // One entry without baseline
        Map<String, Object> op3 = new LinkedHashMap<>();
        op3.put("testItem", "CustomOp");
        op3.put("score", null);
        op3.put("dataStatus", "VALID");
        op3.put("noBaseline", true);
        operatorRanking.add(op3);

        double score = ReportDataAssembler.calculateOverallScoreFromRanking(operatorRanking);
        assertEquals(100.0, score, 0.1,
                "Should average only MatMul(120) and ReLU(80) → 100, ignoring null-score entry");
    }
}
