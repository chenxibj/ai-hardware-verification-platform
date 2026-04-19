package com.lab.scoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * TDD tests for #434: scoring -> vs L40S percentage
 */
@ExtendWith(MockitoExtension.class)
class ScoringServiceTest {

    private ScoringService scoringService;
    private ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private ChipRepository chipRepository;
    @Mock
    private EvaluationResultRepository resultRepository;
    @Mock
    private EvaluationTaskRepository taskRepository;
    @Mock
    private EvaluationPlanRepository planRepository;

    @BeforeEach
    void setUp() {
        scoringService = new ScoringService(objectMapper, chipRepository,
                resultRepository, taskRepository, planRepository);
    }

    @Test
    @DisplayName("#434: scoreFromMetrics returns vs L40S percentage (not 0-100 absolute)")
    void scoreFromMetrics_shouldReturnPercentageVsBaseline() {
        // L40S baseline: MatMul latency = 0.022ms
        // Chip under test: MatMul latency = 0.044ms (2x slower)
        // Expected: (0.022 / 0.044) * 100 = 50%
        setupL40SBaseline("MatMul", 0.022);

        String chipMetrics = "{\"latency_ms_mean\": 0.044}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "MatMul");
        assertEquals(50.0, score, 0.1, "2x slower than L40S should be 50%");
    }

    @Test
    @DisplayName("#434: same as L40S -> 100%")
    void scoreFromMetrics_sameAsBaseline_shouldBe100Percent() {
        setupL40SBaseline("ReLU", 0.007);

        String chipMetrics = "{\"latency_ms_mean\": 0.007}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "ReLU");
        assertEquals(100.0, score, 0.1, "Same latency as L40S should be 100%");
    }

    @Test
    @DisplayName("#434: faster than L40S -> >100%")
    void scoreFromMetrics_fasterThanBaseline_shouldExceed100() {
        setupL40SBaseline("Conv2D", 0.018);

        // Chip is 2x faster
        String chipMetrics = "{\"latency_ms_mean\": 0.009}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "Conv2D");
        assertEquals(200.0, score, 0.1, "2x faster than L40S should be 200%");
    }

    @Test
    @DisplayName("#529: no baseline -> score=-1 (no fallback to log10)")
    void scoreFromMetrics_noBaseline_shouldReturnNegative() {
        setupL40SBaseline("MatMul", 0.022);

        String chipMetrics = "{\"latency_ms_mean\": 1.0}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "UnknownOp");
        // #529: No longer falls back to log10, returns -1
        assertEquals(-1.0, score, 0.01, "No baseline should return -1, not fallback to log10");
    }

    @Test
    @DisplayName("#434: calculateOverallScore returns percentage average")
    void calculateOverallScore_shouldReturnPercentageAverage() {
        // Setup baselines for both operators
        Chip l40s = new Chip();
        l40s.setId(952L);
        l40s.setName("NVIDIA L40S");
        l40s.setChipNo("CHIP-BASELINE-L40S");
        when(chipRepository.findByNameContainingIgnoreCase("L40S"))
                .thenReturn(Collections.singletonList(l40s));

        EvaluationPlan baselinePlan = new EvaluationPlan();
        baselinePlan.setId(679L);
        baselinePlan.setChipId(952L);
        when(planRepository.findByChipId(952L))
                .thenReturn(Collections.singletonList(baselinePlan));

        EvaluationTask bt1 = new EvaluationTask();
        bt1.setId(100L);
        bt1.setTestItem("MatMul");
        bt1.setPlanId(679L);
        EvaluationTask bt2 = new EvaluationTask();
        bt2.setId(101L);
        bt2.setTestItem("ReLU");
        bt2.setPlanId(679L);
        when(taskRepository.findByPlanId(679L))
                .thenReturn(Arrays.asList(bt1, bt2));

        EvaluationResult br1 = new EvaluationResult();
        br1.setTaskId(100L);
        br1.setPassed(true);
        br1.setMetricsSummary("{\"latency_ms_mean\": 0.022}");
        EvaluationResult br2 = new EvaluationResult();
        br2.setTaskId(101L);
        br2.setPassed(true);
        br2.setMetricsSummary("{\"latency_ms_mean\": 0.007}");
        when(resultRepository.findByPlanId(679L))
                .thenReturn(Arrays.asList(br1, br2));

        // Chip results
        EvaluationResult r1 = makeResult(1L, "{\"latency_ms_mean\": 0.022}", true); // MatMul 100%
        EvaluationResult r2 = makeResult(2L, "{\"latency_ms_mean\": 0.014}", true); // ReLU 50%

        EvaluationTask t1 = makeTask(1L, "MatMul");
        EvaluationTask t2 = makeTask(2L, "ReLU");

        double overall = scoringService.calculateOverallScore(
                Arrays.asList(r1, r2), Arrays.asList(t1, t2));
        // (100 + 50) / 2 = 75
        assertEquals(75.0, overall, 0.1);
    }

    // --- Helper methods ---

    private void setupL40SBaseline(String testItem, double latencyMs) {
        Chip l40s = new Chip();
        l40s.setId(952L);
        l40s.setName("NVIDIA L40S");
        l40s.setChipNo("CHIP-BASELINE-L40S");
        lenient().when(chipRepository.findByNameContainingIgnoreCase("L40S"))
                .thenReturn(Collections.singletonList(l40s));

        EvaluationPlan baselinePlan = new EvaluationPlan();
        baselinePlan.setId(679L);
        baselinePlan.setChipId(952L);
        lenient().when(planRepository.findByChipId(952L))
                .thenReturn(Collections.singletonList(baselinePlan));

        EvaluationTask task = new EvaluationTask();
        task.setId(100L);
        task.setTestItem(testItem);
        task.setPlanId(679L);
        lenient().when(taskRepository.findByPlanId(679L))
                .thenReturn(Collections.singletonList(task));

        EvaluationResult result = new EvaluationResult();
        result.setTaskId(100L);
        result.setPassed(true);
        result.setMetricsSummary(String.format("{\"latency_ms_mean\": %s}", latencyMs));
        lenient().when(resultRepository.findByPlanId(679L))
                .thenReturn(Collections.singletonList(result));
    }

    private EvaluationResult makeResult(Long taskId, String metrics, boolean passed) {
        EvaluationResult r = new EvaluationResult();
        r.setTaskId(taskId);
        r.setMetricsSummary(metrics);
        r.setPassed(passed);
        return r;
    }

    // ===== #525: Score cap at 200% =====

    @Test
    @DisplayName("#525: score should be capped at 200% to prevent extreme values")
    void scoreFromMetrics_shouldCapAt200Percent() {
        // Baseline: Add latency = 0.013ms
        // R5 chip: Add latency = 0.004ms → raw ratio = 325%
        // Expected: capped at 200%
        setupL40SBaseline("Add", 0.013);

        String chipMetrics = "{\"latency_ms_mean\": 0.004}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "Add");
        assertEquals(200.0, score, 0.01, "Score exceeding 200% should be capped at 200%");
    }

    @Test
    @DisplayName("#525: score at exactly 200% should not be capped")
    void scoreFromMetrics_exactlyAt200_shouldNotBeCapped() {
        setupL40SBaseline("Conv2D", 0.020);

        // 2x faster → exactly 200%
        String chipMetrics = "{\"latency_ms_mean\": 0.010}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "Conv2D");
        assertEquals(200.0, score, 0.01, "Exactly 200% should remain 200%");
    }

    @Test
    @DisplayName("#525: score below 200% should not be affected by cap")
    void scoreFromMetrics_below200_shouldNotBeCapped() {
        setupL40SBaseline("Softmax", 0.010);

        // 1.5x faster → 150%
        String chipMetrics = "{\"latency_ms_mean\": 0.006666}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "Softmax");
        assertTrue(score < 200.0, "Score below 200% should not be affected");
        assertTrue(score > 140.0, "Score should be around 150%");
    }

    // ===== #527: Score precision - round to 2 decimal places =====

    @Test
    @DisplayName("#527: score should be rounded to 2 decimal places, no .9999999 tails")
    void scoreFromMetrics_shouldBeRoundedTo2Decimals() {
        // Setup: baseline=0.013, chip=0.013 → ratio=100.0000...001
        setupL40SBaseline("GELU", 0.013);

        String chipMetrics = "{\"latency_ms_mean\": 0.013}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "GELU");
        // Should be exactly 100.0, not 100.00000000000001
        assertEquals(100.0, score, 0.0, "Score should be precisely rounded, no floating point tails");

        // String representation should not have excessive decimals
        String scoreStr = String.valueOf(score);
        // After the decimal point, should have at most 2 digits
        if (scoreStr.contains(".")) {
            String decimals = scoreStr.substring(scoreStr.indexOf('.') + 1);
            // Remove trailing zeros for comparison
            String trimmed = decimals.replaceAll("0+$", "");
            assertTrue(trimmed.length() <= 2,
                "Score " + scoreStr + " should have at most 2 decimal places");
        }
    }

    @Test
    @DisplayName("#527: score with repeating decimal should be rounded")
    void scoreFromMetrics_repeatingDecimal_shouldBeRounded() {
        // Setup: baseline=0.010, chip=0.003 → raw ratio=333.333...
        // After 200% cap → 200.0
        setupL40SBaseline("Mul", 0.010);

        String chipMetrics = "{\"latency_ms_mean\": 0.003}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "Mul");
        // Capped at 200.0
        assertEquals(200.0, score, 0.01);
    }

    @Test
    @DisplayName("#529: no baseline returns -1, no log10 fallback")
    void scoreFromMetrics_noBaseline_returnsNegativeOne() {
        setupL40SBaseline("MatMul", 0.022);

        // Unknown operator -> no baseline -> score=-1 (was log10 fallback)
        String chipMetrics = "{\"latency_ms_mean\": 1.5}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "UnknownOp");
        assertEquals(-1.0, score, 0.01, "No baseline should return -1, not use log10");
    }

    @Test
    @DisplayName("#529: scoreLatency throws UnsupportedOperationException")
    void scoreLatency_shouldThrow() {
        assertThrows(UnsupportedOperationException.class,
            () -> scoringService.scoreLatency(1.0),
            "scoreLatency should throw since log10 is removed");
    }
    private EvaluationTask makeTask(Long id, String testItem) {
        EvaluationTask t = new EvaluationTask();
        t.setId(id);
        t.setTestItem(testItem);
        return t;
    }
    // ===== #525: Baseline compatibility with old data =====

    @Test
    @DisplayName("#525: baseline should include old data with passed=false but valid latency")
    void getBaselineLatencyMap_shouldIncludeOldDataWithPassedFalse() {
        // Simulate old L40S data: passed=false, data_status=null, but has valid latency
        Chip l40s = new Chip();
        l40s.setId(952L);
        l40s.setName("NVIDIA L40S");
        l40s.setChipNo("CHIP-BASELINE-L40S");
        lenient().when(chipRepository.findByNameContainingIgnoreCase("L40S"))
                .thenReturn(Collections.singletonList(l40s));

        EvaluationPlan baselinePlan = new EvaluationPlan();
        baselinePlan.setId(679L);
        baselinePlan.setChipId(952L);
        lenient().when(planRepository.findByChipId(952L))
                .thenReturn(Collections.singletonList(baselinePlan));

        EvaluationTask task = new EvaluationTask();
        task.setId(100L);
        task.setTestItem("GELU");
        task.setPlanId(679L);
        lenient().when(taskRepository.findByPlanId(679L))
                .thenReturn(Collections.singletonList(task));

        // Old result: passed=false, data_status=null, but has valid latency_ms_mean
        EvaluationResult result = new EvaluationResult();
        result.setTaskId(100L);
        result.setPassed(false);  // Old data often has passed=false
        result.setDataStatus(null);  // Old data has no data_status
        result.setMetricsSummary("{\"latency_ms_mean\": 0.013}");
        lenient().when(resultRepository.findByPlanId(679L))
                .thenReturn(Collections.singletonList(result));

        // Should still find baseline data (0.013)
        Double baseline = scoringService.getBaselineLatency("GELU");
        assertNotNull(baseline, "Old data with valid latency should be included as baseline");
        assertEquals(0.013, baseline, 0.001, "Baseline latency should be 0.013");
    }

    @Test
    @DisplayName("#525: baseline should skip results with FAILED data_status")
    void getBaselineLatencyMap_shouldSkipFailedResults() {
        Chip l40s = new Chip();
        l40s.setId(952L);
        l40s.setName("NVIDIA L40S");
        l40s.setChipNo("CHIP-BASELINE-L40S");
        lenient().when(chipRepository.findByNameContainingIgnoreCase("L40S"))
                .thenReturn(Collections.singletonList(l40s));

        EvaluationPlan baselinePlan = new EvaluationPlan();
        baselinePlan.setId(679L);
        baselinePlan.setChipId(952L);
        lenient().when(planRepository.findByChipId(952L))
                .thenReturn(Collections.singletonList(baselinePlan));

        EvaluationTask task = new EvaluationTask();
        task.setId(100L);
        task.setTestItem("FailedOp");
        task.setPlanId(679L);
        lenient().when(taskRepository.findByPlanId(679L))
                .thenReturn(Collections.singletonList(task));

        // FAILED result should be excluded
        EvaluationResult result = new EvaluationResult();
        result.setTaskId(100L);
        result.setPassed(false);
        result.setDataStatus("FAILED");
        result.setMetricsSummary("{\"latency_ms_mean\": 0.050}");
        lenient().when(resultRepository.findByPlanId(679L))
                .thenReturn(Collections.singletonList(result));

        Double baseline = scoringService.getBaselineLatency("FailedOp");
        assertNull(baseline, "FAILED results should not be used as baseline");
    }


    // ===== #527: Comprehensive precision tests =====

    @Test
    @DisplayName("#527: calculateOverallScore should be rounded to 2 decimal places")
    void calculateOverallScore_shouldBeRounded() {
        // Setup baselines for 3 operators with values that produce repeating decimals
        Chip l40s = new Chip();
        l40s.setId(952L);
        l40s.setName("NVIDIA L40S");
        l40s.setChipNo("CHIP-BASELINE-L40S");
        when(chipRepository.findByNameContainingIgnoreCase("L40S"))
                .thenReturn(Collections.singletonList(l40s));

        EvaluationPlan baselinePlan = new EvaluationPlan();
        baselinePlan.setId(679L);
        baselinePlan.setChipId(952L);
        when(planRepository.findByChipId(952L))
                .thenReturn(Collections.singletonList(baselinePlan));

        EvaluationTask bt1 = new EvaluationTask();
        bt1.setId(100L);
        bt1.setTestItem("OpA");
        bt1.setPlanId(679L);
        EvaluationTask bt2 = new EvaluationTask();
        bt2.setId(101L);
        bt2.setTestItem("OpB");
        bt2.setPlanId(679L);
        EvaluationTask bt3 = new EvaluationTask();
        bt3.setId(102L);
        bt3.setTestItem("OpC");
        bt3.setPlanId(679L);
        when(taskRepository.findByPlanId(679L))
                .thenReturn(Arrays.asList(bt1, bt2, bt3));

        EvaluationResult br1 = new EvaluationResult();
        br1.setTaskId(100L);
        br1.setPassed(true);
        br1.setMetricsSummary("{\"latency_ms_mean\": 0.010}");
        EvaluationResult br2 = new EvaluationResult();
        br2.setTaskId(101L);
        br2.setPassed(true);
        br2.setMetricsSummary("{\"latency_ms_mean\": 0.020}");
        EvaluationResult br3 = new EvaluationResult();
        br3.setTaskId(102L);
        br3.setPassed(true);
        br3.setMetricsSummary("{\"latency_ms_mean\": 0.030}");
        when(resultRepository.findByPlanId(679L))
                .thenReturn(Arrays.asList(br1, br2, br3));

        // Chip results: 3 ops with scores that average to a repeating decimal
        // OpA: baseline=0.010, chip=0.015 -> 66.67%
        // OpB: baseline=0.020, chip=0.015 -> 133.33%
        // OpC: baseline=0.030, chip=0.015 -> 200.0%
        // Average: (66.67 + 133.33 + 200.0) / 3 = 133.333...
        EvaluationResult r1 = makeResult(1L, "{\"latency_ms_mean\": 0.015}", true);
        EvaluationResult r2 = makeResult(2L, "{\"latency_ms_mean\": 0.015}", true);
        EvaluationResult r3 = makeResult(3L, "{\"latency_ms_mean\": 0.015}", true);

        EvaluationTask t1 = makeTask(1L, "OpA");
        EvaluationTask t2 = makeTask(2L, "OpB");
        EvaluationTask t3 = makeTask(3L, "OpC");

        double overall = scoringService.calculateOverallScore(
                Arrays.asList(r1, r2, r3), Arrays.asList(t1, t2, t3));

        // Should be 133.33, not 133.33333333...
        String scoreStr = String.valueOf(overall);
        if (scoreStr.contains(".")) {
            String decimals = scoreStr.substring(scoreStr.indexOf('.') + 1);
            String trimmed = decimals.replaceAll("0+$", "");
            assertTrue(trimmed.length() <= 2,
                "Overall score " + scoreStr + " should have at most 2 decimal places, not " + trimmed.length());
        }
    }

    @Test
    @DisplayName("#527: calculateDimensionScores should be rounded to 2 decimal places")
    void calculateDimensionScores_shouldBeRounded() {
        // Setup baseline
        Chip l40s = new Chip();
        l40s.setId(952L);
        l40s.setName("NVIDIA L40S");
        l40s.setChipNo("CHIP-BASELINE-L40S");
        when(chipRepository.findByNameContainingIgnoreCase("L40S"))
                .thenReturn(Collections.singletonList(l40s));

        EvaluationPlan baselinePlan = new EvaluationPlan();
        baselinePlan.setId(679L);
        baselinePlan.setChipId(952L);
        when(planRepository.findByChipId(952L))
                .thenReturn(Collections.singletonList(baselinePlan));

        EvaluationTask bt1 = new EvaluationTask();
        bt1.setId(100L);
        bt1.setTestItem("MatMul");
        bt1.setPlanId(679L);
        when(taskRepository.findByPlanId(679L))
                .thenReturn(Collections.singletonList(bt1));

        EvaluationResult br1 = new EvaluationResult();
        br1.setTaskId(100L);
        br1.setPassed(true);
        br1.setMetricsSummary("{\"latency_ms_mean\": 0.010}");
        when(resultRepository.findByPlanId(679L))
                .thenReturn(Collections.singletonList(br1));

        // Two results for same dimension that produce repeating average
        // MatMul: baseline=0.010, chip1=0.015 -> 66.67, chip2=0.012 -> 83.33
        // Average: (66.67 + 83.33) / 2 = 75.0 (clean in this case)
        // Let's use 3 results: 66.67 + 83.33 + 100.0 -> avg = 83.333...
        EvaluationResult r1 = makeResult(1L, "{\"latency_ms_mean\": 0.015}", true);
        EvaluationResult r2 = makeResult(2L, "{\"latency_ms_mean\": 0.012}", true);
        EvaluationResult r3 = makeResult(3L, "{\"latency_ms_mean\": 0.010}", true);

        EvaluationTask t1 = makeTask(1L, "MatMul");
        EvaluationTask t2 = makeTask(2L, "MatMul");
        EvaluationTask t3 = makeTask(3L, "MatMul");

        Map<String, Double> dimScores = scoringService.calculateDimensionScores(
                Arrays.asList(r1, r2, r3), Arrays.asList(t1, t2, t3));

        for (Map.Entry<String, Double> entry : dimScores.entrySet()) {
            double score = entry.getValue();
            String scoreStr = String.valueOf(score);
            if (scoreStr.contains(".")) {
                String decimals = scoreStr.substring(scoreStr.indexOf('.') + 1);
                String trimmed = decimals.replaceAll("0+$", "");
                assertTrue(trimmed.length() <= 2,
                    "Dimension " + entry.getKey() + " score " + scoreStr
                    + " should have at most 2 decimal places");
            }
        }
    }

    @Test
    @DisplayName("#527: scoreFromMetrics with tricky ratio should not have precision tails")
    void scoreFromMetrics_trickyRatio_noPrecisionTails() {
        // 1/3 ratio scenario: baseline=0.010, chip=0.030 -> 33.333...%
        setupL40SBaseline("TrickyOp", 0.010);

        String chipMetrics = "{\"latency_ms_mean\": 0.030}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "TrickyOp");

        assertEquals(33.33, score, 0.001, "1/3 ratio should be rounded to 33.33");
        // Verify no long decimal tails
        String scoreStr = String.valueOf(score);
        if (scoreStr.contains(".")) {
            String decimals = scoreStr.substring(scoreStr.indexOf('.') + 1);
            String trimmed = decimals.replaceAll("0+$", "");
            assertTrue(trimmed.length() <= 2,
                "Score " + scoreStr + " should have at most 2 decimal places");
        }
    }

}
