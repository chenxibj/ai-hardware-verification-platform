package com.lab.baseline;

import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.runspec.RunSpec;
import com.lab.runspec.RunSpecRepository;
import com.lab.scoring.ScoringService;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * #528: Tests for BaselineService
 */
@ExtendWith(MockitoExtension.class)
class BaselineServiceTest {

    @Mock private ChipRepository chipRepository;
    @Mock private EvaluationPlanRepository planRepository;
    @Mock private EvaluationResultRepository resultRepository;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private RunSpecRepository runSpecRepository;
    @Mock private ScoringService scoringService;

    private BaselineService baselineService;

    @BeforeEach
    void setUp() {
        baselineService = new BaselineService(
            chipRepository, planRepository, resultRepository,
            taskRepository, runSpecRepository, scoringService);
    }

    @Test
    @DisplayName("#528: listBaselines groups by runSpec")
    void listBaselines_groupsByRunSpec() {
        Chip chip = new Chip();
        chip.setId(1L);
        chip.setName("Test Chip");
        when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

        RunSpec spec1 = new RunSpec();
        spec1.setId(13L);
        spec1.setName("单卡");
        spec1.setCode("GPU-1");
        spec1.setGpuPerNode(1);
        spec1.setCategory("gpu");
        when(runSpecRepository.findById(13L)).thenReturn(Optional.of(spec1));

        RunSpec spec2 = new RunSpec();
        spec2.setId(15L);
        spec2.setName("四卡");
        spec2.setCode("GPU-4");
        spec2.setGpuPerNode(4);
        spec2.setCategory("gpu");
        when(runSpecRepository.findById(15L)).thenReturn(Optional.of(spec2));

        EvaluationPlan plan1 = new EvaluationPlan();
        plan1.setId(100L);
        plan1.setPlanNo("PLAN-001");
        plan1.setChipId(1L);
        plan1.setRunSpecId(13L);
        plan1.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
        plan1.setCompletedAt(Instant.now());
        plan1.setCreatedAt(Instant.now());

        EvaluationPlan plan2 = new EvaluationPlan();
        plan2.setId(101L);
        plan2.setPlanNo("PLAN-002");
        plan2.setChipId(1L);
        plan2.setRunSpecId(15L);
        plan2.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
        plan2.setCompletedAt(Instant.now());
        plan2.setCreatedAt(Instant.now());

        when(planRepository.findByChipId(1L)).thenReturn(List.of(plan1, plan2));
        when(resultRepository.findByPlanId(anyLong())).thenReturn(List.of());
        when(taskRepository.findByPlanId(anyLong())).thenReturn(List.of());

        List<Map<String, Object>> baselines = baselineService.listBaselines(1L);

        assertEquals(2, baselines.size());
        // Each group should have correct runSpec info
        boolean foundSpec13 = baselines.stream().anyMatch(b -> Long.valueOf(13L).equals(b.get("runSpecId")));
        boolean foundSpec15 = baselines.stream().anyMatch(b -> Long.valueOf(15L).equals(b.get("runSpecId")));
        assertTrue(foundSpec13, "Should have run_spec 13 group");
        assertTrue(foundSpec15, "Should have run_spec 15 group");
    }

    @Test
    @DisplayName("#528: setDefaultBaseline updates chip and clears cache")
    void setDefaultBaseline_updatesChipAndClearsCache() {
        Chip chip = new Chip();
        chip.setId(1L);
        chip.setName("Test Chip");
        when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(100L);
        plan.setPlanNo("PLAN-001");
        plan.setChipId(1L);
        plan.setRunSpecId(13L);
        plan.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
        when(planRepository.findById(100L)).thenReturn(Optional.of(plan));
        when(chipRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> result = baselineService.setDefaultBaseline(1L, 100L);

        assertEquals(100L, result.get("defaultBaselinePlanId"));
        assertEquals("PLAN-001", result.get("planNo"));
        verify(scoringService).clearBaselineCache();
        verify(chipRepository).save(chip);
        assertEquals(100L, chip.getDefaultBaselinePlanId());
    }

    @Test
    @DisplayName("#528: setDefaultBaseline rejects plan from different chip")
    void setDefaultBaseline_rejectsDifferentChip() {
        Chip chip = new Chip();
        chip.setId(1L);
        when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(200L);
        plan.setChipId(2L); // Different chip!
        plan.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
        when(planRepository.findById(200L)).thenReturn(Optional.of(plan));

        assertThrows(RuntimeException.class, () -> baselineService.setDefaultBaseline(1L, 200L));
    }

    @Test
    @DisplayName("#528: setDefaultBaseline rejects non-completed plan")
    void setDefaultBaseline_rejectsNonCompleted() {
        Chip chip = new Chip();
        chip.setId(1L);
        when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(100L);
        plan.setChipId(1L);
        plan.setStatus(EvaluationPlan.PlanStatus.RUNNING);
        when(planRepository.findById(100L)).thenReturn(Optional.of(plan));

        assertThrows(RuntimeException.class, () -> baselineService.setDefaultBaseline(1L, 100L));
    }

    @Test
    @DisplayName("#528: getBaselineCoverage returns coverage info")
    void getBaselineCoverage_returnsCoverageInfo() {
        Map<String, Double> baselineMap = Map.of("MatMul", 1.5, "Conv2D", 2.3);
        when(scoringService.getBaselineLatencyMap(13L)).thenReturn(baselineMap);
        when(scoringService.getBaselineSource(13L)).thenReturn(Map.of("available", true));

        RunSpec spec = new RunSpec();
        spec.setId(13L);
        spec.setName("单卡");
        spec.setCode("GPU-1");
        when(runSpecRepository.findById(13L)).thenReturn(Optional.of(spec));

        Map<String, Object> coverage = baselineService.getBaselineCoverage(null, 13L);

        assertEquals(2, coverage.get("baselineCoveredItems"));
        assertNotNull(coverage.get("baselineSource"));
        assertEquals(13L, coverage.get("runSpecId"));
    }
}
