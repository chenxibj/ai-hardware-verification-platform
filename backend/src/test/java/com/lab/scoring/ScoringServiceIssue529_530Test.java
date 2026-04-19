package com.lab.scoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.runspec.RunSpec;
import com.lab.runspec.RunSpecRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * TDD tests for:
 *   #529 [P0]: Remove log10 fallback — no baseline → return null (not log10 score)
 *   #530 [P0]: inferRunSpecFromEvalConfig — handle NULL runSpecId in old Plans
 */
@ExtendWith(MockitoExtension.class)
class ScoringServiceIssue529_530Test {

    private ScoringService scoringService;
    private ObjectMapper objectMapper = new ObjectMapper();

    @Mock private ChipRepository chipRepository;
    @Mock private EvaluationResultRepository resultRepository;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private EvaluationPlanRepository planRepository;
    @Mock private RunSpecRepository runSpecRepository;

    @BeforeEach
    void setUp() {
        scoringService = new ScoringService(objectMapper, chipRepository,
                resultRepository, taskRepository, planRepository, runSpecRepository);
    }

    // ========================
    // #529: Remove log10 fallback
    // ========================

    @Nested
    @DisplayName("#529: log10 fallback removal")
    class Issue529Tests {

        @Test
        @DisplayName("scoreFromMetrics returns null when no baseline exists for testItem")
        void scoreFromMetrics_noBaseline_shouldReturnNull() {
            // Setup: L40S baseline has MatMul, but NOT UnknownOp
            setupL40SBaseline("MatMul", 0.022);

            String chipMetrics = "{\"latency_ms_mean\": 1.0}";
            // BEFORE fix: returns log10-based score (~100.0 for 1.0ms)
            // AFTER fix: should return null (no baseline = no score)
            Double score = scoringService.scoreFromMetrics(chipMetrics, "UnknownOp");
            assertNull(score, "#529: No baseline for UnknownOp → score should be null, not log10 fallback");
        }

        @Test
        @DisplayName("scoreFromMetrics returns null when testItem is null and no baseline")
        void scoreFromMetrics_nullTestItem_shouldReturnNull() {
            setupEmptyBaseline();

            String chipMetrics = "{\"latency_ms_mean\": 5.0}";
            Double score = scoringService.scoreFromMetrics(chipMetrics, null);
            assertNull(score, "#529: null testItem with no baseline → score should be null");
        }

        @Test
        @DisplayName("scoreLatency method should be removed (compile-time check)")
        void scoreLatency_shouldNotExist() {
            // This test verifies that the log10-based scoreLatency method has been removed.
            // If ScoringService still has a public scoreLatency(double) method, the method exists.
            // After #529, this method should be gone.
            try {
                ScoringService.class.getMethod("scoreLatency", double.class);
                fail("#529: scoreLatency(double) method should be removed — log10 fallback must not exist");
            } catch (NoSuchMethodException e) {
                // Good — method was removed
            }
        }

        @Test
        @DisplayName("scoreFromMetrics still works when baseline exists")
        void scoreFromMetrics_withBaseline_stillWorks() {
            setupL40SBaseline("MatMul", 0.022);

            String chipMetrics = "{\"latency_ms_mean\": 0.044}";
            Double score = scoringService.scoreFromMetrics(chipMetrics, "MatMul");
            assertNotNull(score, "With baseline, score should not be null");
            assertEquals(50.0, score, 0.1, "2x slower → 50%");
        }

        @Test
        @DisplayName("calculateOverallScore skips null-scored operators in average")
        void calculateOverallScore_shouldSkipNullScores() {
            // Setup: baseline only for MatMul, not for ReLU
            Chip l40s = new Chip();
            l40s.setId(952L);
            l40s.setName("NVIDIA L40S");
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
            br1.setMetricsSummary("{\"latency_ms_mean\": 0.022}");
            when(resultRepository.findByPlanId(679L))
                    .thenReturn(Collections.singletonList(br1));

            // Chip: MatMul 100%, UnknownOp has no baseline (should be null, skipped)
            EvaluationResult r1 = makeResult(1L, "{\"latency_ms_mean\": 0.022}", true);
            EvaluationResult r2 = makeResult(2L, "{\"latency_ms_mean\": 0.050}", true);

            EvaluationTask t1 = makeTask(1L, "MatMul");
            EvaluationTask t2 = makeTask(2L, "UnknownOp");

            double overall = scoringService.calculateOverallScore(
                    Arrays.asList(r1, r2), Arrays.asList(t1, t2));
            // Only MatMul has baseline (100%), UnknownOp is skipped
            assertEquals(100.0, overall, 0.1,
                    "#529: UnknownOp (no baseline) should be skipped, overall = average of scored ops only");
        }

        @Test
        @DisplayName("calculateDimensionScores skips null-scored operators")
        void calculateDimensionScores_shouldSkipNullScores() {
            setupL40SBaseline("MatMul", 0.022);

            EvaluationResult r1 = makeResult(1L, "{\"latency_ms_mean\": 0.022}", true); // 100%
            EvaluationResult r2 = makeResult(2L, "{\"latency_ms_mean\": 0.050}", true); // no baseline

            EvaluationTask t1 = makeTask(1L, "MatMul");
            EvaluationTask t2 = makeTask(2L, "UnknownOp");

            Map<String, Double> dimScores = scoringService.calculateDimensionScores(
                    Arrays.asList(r1, r2), Arrays.asList(t1, t2));

            // MatMul's dimension should have score based only on MatMul (100%)
            // UnknownOp should not drag down the average
            for (Double score : dimScores.values()) {
                if (score > 0) {
                    assertEquals(100.0, score, 0.1,
                            "#529: Null-scored operators should not affect dimension averages");
                }
            }
        }

        @Test
        @DisplayName("scoreFromMetrics with no L40S chip at all returns null")
        void scoreFromMetrics_noL40SChip_shouldReturnNull() {
            // No L40S chip in DB at all
            when(chipRepository.findByNameContainingIgnoreCase("L40S"))
                    .thenReturn(Collections.emptyList());

            String chipMetrics = "{\"latency_ms_mean\": 1.0}";
            Double score = scoringService.scoreFromMetrics(chipMetrics, "MatMul");
            assertNull(score, "#529: No L40S chip → no baseline → score must be null");
        }

        @Test
        @DisplayName("generateOperatorRanking shows null score for operators without baseline")
        void generateOperatorRanking_shouldShowNullForNoBaseline() {
            setupL40SBaseline("MatMul", 0.022);

            EvaluationResult r1 = makeResult(1L, "{\"latency_ms_mean\": 0.022}", true);
            EvaluationResult r2 = makeResult(2L, "{\"latency_ms_mean\": 0.050}", true);

            EvaluationTask t1 = makeTask(1L, "MatMul");
            EvaluationTask t2 = makeTask(2L, "UnknownOp");

            String ranking = scoringService.generateOperatorRanking(
                    Arrays.asList(r1, r2), Arrays.asList(t1, t2));

            assertNotNull(ranking);
            // The ranking JSON should have null score for UnknownOp
            assertTrue(ranking.contains("\"score\":null") || ranking.contains("\"score\" : null"),
                    "#529: UnknownOp should have null score in ranking, got: " + ranking);
        }
    }

    // ========================
    // #530: inferRunSpecFromEvalConfig
    // ========================

    @Nested
    @DisplayName("#530: inferRunSpecFromEvalConfig")
    class Issue530Tests {

        @Test
        @DisplayName("inferRunSpecFromEvalConfig extracts gpuCount + parallelMode and matches")
        void inferRunSpec_shouldMatchFromEvalConfig() {
            EvaluationPlan plan = new EvaluationPlan();
            plan.setId(100L);
            plan.setRunSpecId(null); // old plan, no runSpecId
            plan.setEvalConfig("{\"gpuCount\": 4, \"parallelMode\": \"DDP\"}");

            RunSpec matchedSpec = new RunSpec();
            matchedSpec.setId(3L);
            matchedSpec.setGpuPerNode(4);
            matchedSpec.setParallelMode("DDP");
            when(runSpecRepository.findByGpuPerNodeAndParallelMode(4, "DDP"))
                    .thenReturn(Optional.of(matchedSpec));

            Long result = scoringService.inferRunSpecFromEvalConfig(plan);
            assertEquals(3L, result, "#530: Should match run_spec with gpuPerNode=4, parallelMode=DDP");
        }

        @Test
        @DisplayName("inferRunSpecFromEvalConfig returns null when no match")
        void inferRunSpec_noMatch_shouldReturnNull() {
            EvaluationPlan plan = new EvaluationPlan();
            plan.setId(101L);
            plan.setRunSpecId(null);
            plan.setEvalConfig("{\"gpuCount\": 16, \"parallelMode\": \"FSDP\"}");

            when(runSpecRepository.findByGpuPerNodeAndParallelMode(16, "FSDP"))
                    .thenReturn(Optional.empty());

            Long result = scoringService.inferRunSpecFromEvalConfig(plan);
            assertNull(result, "#530: No matching run_spec → return null");
        }

        @Test
        @DisplayName("inferRunSpecFromEvalConfig handles null evalConfig")
        void inferRunSpec_nullEvalConfig_shouldReturnNull() {
            EvaluationPlan plan = new EvaluationPlan();
            plan.setId(102L);
            plan.setRunSpecId(null);
            plan.setEvalConfig(null);

            Long result = scoringService.inferRunSpecFromEvalConfig(plan);
            assertNull(result, "#530: null evalConfig → return null");
        }

        @Test
        @DisplayName("inferRunSpecFromEvalConfig handles malformed JSON")
        void inferRunSpec_malformedJson_shouldReturnNull() {
            EvaluationPlan plan = new EvaluationPlan();
            plan.setId(103L);
            plan.setRunSpecId(null);
            plan.setEvalConfig("not a json");

            Long result = scoringService.inferRunSpecFromEvalConfig(plan);
            assertNull(result, "#530: Malformed JSON → return null (graceful)");
        }

        @Test
        @DisplayName("inferRunSpecFromEvalConfig handles missing gpuCount (defaults to 0)")
        void inferRunSpec_missingGpuCount_shouldDefault0() {
            EvaluationPlan plan = new EvaluationPlan();
            plan.setId(104L);
            plan.setRunSpecId(null);
            plan.setEvalConfig("{\"parallelMode\": \"none\"}");

            RunSpec cpuSpec = new RunSpec();
            cpuSpec.setId(1L);
            cpuSpec.setGpuPerNode(0);
            cpuSpec.setParallelMode("none");
            when(runSpecRepository.findByGpuPerNodeAndParallelMode(0, "none"))
                    .thenReturn(Optional.of(cpuSpec));

            Long result = scoringService.inferRunSpecFromEvalConfig(plan);
            assertEquals(1L, result, "#530: Missing gpuCount defaults to 0 (CPU spec)");
        }

        @Test
        @DisplayName("inferRunSpecFromEvalConfig handles nested evalConfig format")
        void inferRunSpec_nestedFormat_shouldExtract() {
            EvaluationPlan plan = new EvaluationPlan();
            plan.setId(105L);
            plan.setRunSpecId(null);
            // Some old plans may have nested structure
            plan.setEvalConfig("{\"hardware\": {\"gpuCount\": 8, \"parallelMode\": \"TP\"}}");

            RunSpec spec = new RunSpec();
            spec.setId(5L);
            spec.setGpuPerNode(8);
            spec.setParallelMode("TP");
            when(runSpecRepository.findByGpuPerNodeAndParallelMode(8, "TP"))
                    .thenReturn(Optional.of(spec));

            Long result = scoringService.inferRunSpecFromEvalConfig(plan);
            assertEquals(5L, result, "#530: Should handle nested hardware.gpuCount format");
        }

        @Test
        @DisplayName("inferRunSpecFromEvalConfig handles empty parallelMode")
        void inferRunSpec_emptyParallelMode_shouldMatch() {
            EvaluationPlan plan = new EvaluationPlan();
            plan.setId(106L);
            plan.setRunSpecId(null);
            plan.setEvalConfig("{\"gpuCount\": 1}");

            RunSpec singleGpu = new RunSpec();
            singleGpu.setId(2L);
            singleGpu.setGpuPerNode(1);
            singleGpu.setParallelMode("");
            when(runSpecRepository.findByGpuPerNodeAndParallelMode(1, ""))
                    .thenReturn(Optional.of(singleGpu));

            Long result = scoringService.inferRunSpecFromEvalConfig(plan);
            assertEquals(2L, result, "#530: Missing parallelMode defaults to empty string");
        }
    }

    // ========================
    // Helpers
    // ========================

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

    private void setupEmptyBaseline() {
        lenient().when(chipRepository.findByNameContainingIgnoreCase("L40S"))
                .thenReturn(Collections.emptyList());
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
