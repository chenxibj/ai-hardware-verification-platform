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
    @DisplayName("#434: no baseline -> old scoring fallback")
    void scoreFromMetrics_noBaseline_shouldFallback() {
        setupL40SBaseline("MatMul", 0.022);

        String chipMetrics = "{\"latency_ms_mean\": 1.0}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "UnknownOp");
        // Old formula: 100 - 20 * log10(1.0) = 100
        assertEquals(100.0, score, 0.1, "No baseline should fallback to old scoring");
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

    private EvaluationTask makeTask(Long id, String testItem) {
        EvaluationTask t = new EvaluationTask();
        t.setId(id);
        t.setTestItem(testItem);
        return t;
    }
}
