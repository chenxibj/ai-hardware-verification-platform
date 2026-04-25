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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * #528: Tests for spec-aware baseline matching in ScoringService
 * #544: Updated to use dynamic DB-loaded mapping
 */
@ExtendWith(MockitoExtension.class)
class SpecAwareScoringTest {

    private ObjectMapper objectMapper = new ObjectMapper();

    @Mock private ChipRepository chipRepository;
    @Mock private EvaluationResultRepository resultRepository;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private EvaluationPlanRepository planRepository;
    @Mock private RunSpecRepository runSpecRepository;

    private ScoringService scoringService;

    @BeforeEach
    void setUp() {
        // #544: Setup default run_specs mapping from DB
        List<RunSpec> defaultSpecs = Arrays.asList(
                makeRunSpec(11L, "CPU-Only", "CPU", 0),
                makeRunSpec(13L, "Single-GPU", "GPU", 1),
                makeRunSpec(14L, "Dual-GPU", "GPU", 2),
                makeRunSpec(15L, "Quad-GPU", "GPU", 4),
                makeRunSpec(16L, "Octo-GPU", "GPU", 8)
        );
        lenient().when(runSpecRepository.findAll()).thenReturn(defaultSpecs);

        scoringService = new ScoringService(objectMapper, chipRepository,
                resultRepository, taskRepository, planRepository, runSpecRepository);
        scoringService.initGpuCountToSpecIdMapping();
    }

    private RunSpec makeRunSpec(Long id, String name, String category, int gpuPerNode) {
        RunSpec spec = new RunSpec();
        spec.setId(id);
        spec.setName(name);
        spec.setCategory(category);
        spec.setGpuPerNode(gpuPerNode);
        return spec;
    }

    private Chip makeL40S() {
        Chip c = new Chip();
        c.setId(952L);
        c.setName("NVIDIA L40S");
        c.setChipNo("CHIP-BASELINE-L40S");
        return c;
    }

    @Test
    @DisplayName("#528: getBaselineLatencyMap with runSpecId only uses matching plans")
    void getBaselineLatencyMap_withRunSpecId_filtersCorrectly() {
        Chip l40s = makeL40S();
        when(chipRepository.findByNameContainingIgnoreCase("L40S")).thenReturn(List.of(l40s));

        EvaluationPlan plan1 = new EvaluationPlan();
        plan1.setId(100L);
        plan1.setChipId(952L);
        plan1.setRunSpecId(13L);
        plan1.setStatus(EvaluationPlan.PlanStatus.COMPLETED);

        when(planRepository.findByChipIdAndRunSpecIdAndStatus(952L, 13L, EvaluationPlan.PlanStatus.COMPLETED))
                .thenReturn(List.of(plan1));

        EvaluationTask task1 = new EvaluationTask();
        task1.setId(1000L);
        task1.setTestItem("MatMul");
        when(taskRepository.findByPlanId(100L)).thenReturn(List.of(task1));

        EvaluationResult result1 = new EvaluationResult();
        result1.setTaskId(1000L);
        result1.setMetricsSummary("{\"latency_ms_mean\": 1.5, \"throughput_ops\": 1000}");
        when(resultRepository.findByPlanId(100L)).thenReturn(List.of(result1));

        Map<String, Double> baseline = scoringService.getBaselineLatencyMap(13L);

        assertFalse(baseline.isEmpty());
        assertEquals(1.5, baseline.get("MatMul"));
    }

    @Test
    @DisplayName("#528: getBaselineLatencyMap with null runSpecId uses legacy path")
    void getBaselineLatencyMap_withNullRunSpecId_usesLegacy() {
        Chip l40s = makeL40S();
        when(chipRepository.findByNameContainingIgnoreCase("L40S")).thenReturn(List.of(l40s));

        EvaluationPlan plan1 = new EvaluationPlan();
        plan1.setId(100L);
        plan1.setChipId(952L);
        plan1.setRunSpecId(13L);
        when(planRepository.findByChipId(952L)).thenReturn(List.of(plan1));

        EvaluationTask task1 = new EvaluationTask();
        task1.setId(1000L);
        task1.setTestItem("Conv2D");
        when(taskRepository.findByPlanId(100L)).thenReturn(List.of(task1));

        EvaluationResult result1 = new EvaluationResult();
        result1.setTaskId(1000L);
        result1.setMetricsSummary("{\"latency_ms_mean\": 2.3, \"throughput_ops\": 500}");
        when(resultRepository.findByPlanId(100L)).thenReturn(List.of(result1));

        Map<String, Double> baseline = scoringService.getBaselineLatencyMap(null);

        assertEquals(2.3, baseline.get("Conv2D"));
    }

    @Test
    @DisplayName("#528: scoreFromMetrics with runSpecId uses spec-specific baseline")
    void scoreFromMetrics_withRunSpecId_usesSpecBaseline() {
        Chip l40s = makeL40S();
        when(chipRepository.findByNameContainingIgnoreCase("L40S")).thenReturn(List.of(l40s));

        EvaluationPlan baselinePlan = new EvaluationPlan();
        baselinePlan.setId(100L);
        baselinePlan.setChipId(952L);
        baselinePlan.setRunSpecId(13L);
        baselinePlan.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
        when(planRepository.findByChipIdAndRunSpecIdAndStatus(952L, 13L, EvaluationPlan.PlanStatus.COMPLETED))
                .thenReturn(List.of(baselinePlan));

        EvaluationTask baselineTask = new EvaluationTask();
        baselineTask.setId(1000L);
        baselineTask.setTestItem("MatMul");
        when(taskRepository.findByPlanId(100L)).thenReturn(List.of(baselineTask));

        EvaluationResult baselineResult = new EvaluationResult();
        baselineResult.setTaskId(1000L);
        baselineResult.setMetricsSummary("{\"latency_ms_mean\": 2.0}");
        when(resultRepository.findByPlanId(100L)).thenReturn(List.of(baselineResult));

        String chipMetrics = "{\"latency_ms_mean\": 4.0}";
        double score = scoringService.scoreFromMetrics(chipMetrics, "MatMul", 13L);

        assertEquals(50.0, score, 0.01);
    }

    @Test
    @DisplayName("#528: getBaselineLatencyMap returns empty when no matching plans")
    void getBaselineLatencyMap_noMatchingPlans_returnsEmpty() {
        Chip l40s = makeL40S();
        when(chipRepository.findByNameContainingIgnoreCase("L40S")).thenReturn(List.of(l40s));
        when(planRepository.findByChipIdAndRunSpecIdAndStatus(952L, 99L, EvaluationPlan.PlanStatus.COMPLETED))
                .thenReturn(List.of());

        Map<String, Double> baseline = scoringService.getBaselineLatencyMap(99L);

        assertTrue(baseline.isEmpty());
    }

    @Test
    @DisplayName("#528: getBaselineSource returns source info for available baseline")
    void getBaselineSource_available() {
        Chip l40s = makeL40S();
        when(chipRepository.findByNameContainingIgnoreCase("L40S")).thenReturn(List.of(l40s));

        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(100L);
        plan.setPlanNo("PLAN-001");
        plan.setChipId(952L);
        plan.setRunSpecId(13L);
        plan.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
        plan.setCompletedAt(java.time.Instant.now());
        plan.setCreatedAt(java.time.Instant.now());
        when(planRepository.findByChipIdAndRunSpecIdAndStatus(952L, 13L, EvaluationPlan.PlanStatus.COMPLETED))
                .thenReturn(List.of(plan));
        when(taskRepository.findByPlanId(100L)).thenReturn(List.of());
        when(resultRepository.findByPlanId(100L)).thenReturn(List.of());

        Map<String, Object> source = scoringService.getBaselineSource(13L);

        assertEquals(true, source.get("available"));
        assertEquals("same_spec", source.get("matchMode"));
        assertEquals("NVIDIA L40S", source.get("chipName"));
        assertEquals("PLAN-001", source.get("planNo"));
    }

    @Test
    @DisplayName("#528: getBaselineSource returns unavailable when no matching data")
    void getBaselineSource_unavailable() {
        Chip l40s = makeL40S();
        when(chipRepository.findByNameContainingIgnoreCase("L40S")).thenReturn(List.of(l40s));
        when(planRepository.findByChipIdAndRunSpecIdAndStatus(952L, 99L, EvaluationPlan.PlanStatus.COMPLETED))
                .thenReturn(List.of());

        Map<String, Object> source = scoringService.getBaselineSource(99L);

        assertEquals(false, source.get("available"));
        assertNotNull(source.get("reason"));
    }

    @Test
    @DisplayName("#528: clearBaselineCache per-spec only clears that spec")
    void clearBaselineCache_perSpec() {
        Chip l40s = makeL40S();
        when(chipRepository.findByNameContainingIgnoreCase("L40S")).thenReturn(List.of(l40s));
        when(planRepository.findByChipIdAndRunSpecIdAndStatus(eq(952L), anyLong(), eq(EvaluationPlan.PlanStatus.COMPLETED)))
                .thenReturn(List.of());

        scoringService.getBaselineLatencyMap(13L);
        scoringService.getBaselineLatencyMap(15L);

        // Clear only spec 13
        scoringService.clearBaselineCache(13L);

        // Re-request spec 13 should call repo again, spec 15 should be cached
        scoringService.getBaselineLatencyMap(13L);

        verify(planRepository, times(2)).findByChipIdAndRunSpecIdAndStatus(952L, 13L, EvaluationPlan.PlanStatus.COMPLETED);
        verify(planRepository, times(1)).findByChipIdAndRunSpecIdAndStatus(952L, 15L, EvaluationPlan.PlanStatus.COMPLETED);
    }
}
