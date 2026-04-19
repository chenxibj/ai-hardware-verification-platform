package com.lab.scoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.chip.ChipRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResultRepository;
import com.lab.task.EvaluationTaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;

/**
 * #530: Tests for run_spec_id inference from eval_config
 */
@ExtendWith(MockitoExtension.class)
class RunSpecInferenceTest {

    private ScoringService scoringService;
    private ObjectMapper objectMapper = new ObjectMapper();

    @Mock private ChipRepository chipRepository;
    @Mock private EvaluationResultRepository resultRepository;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private EvaluationPlanRepository planRepository;

    @BeforeEach
    void setUp() {
        scoringService = new ScoringService(objectMapper, chipRepository,
                resultRepository, taskRepository, planRepository);
    }

    @Test
    @DisplayName("#530: gpuCount=1 → 单卡GPU (runSpecId=13)")
    void inferRunSpecId_gpuCount1_shouldBeSingleGpu() {
        Long result = scoringService.inferRunSpecIdFromEvalConfig("{\"evalType\": \"OPERATOR\", \"gpuCount\": 1}");
        assertEquals(13L, result);
    }

    @Test
    @DisplayName("#530: gpuCount=2 → 双卡GPU (runSpecId=14)")
    void inferRunSpecId_gpuCount2_shouldBeDualGpu() {
        Long result = scoringService.inferRunSpecIdFromEvalConfig("{\"evalType\": \"MODEL\", \"gpuCount\": 2}");
        assertEquals(14L, result);
    }

    @Test
    @DisplayName("#530: gpuCount=4 → 四卡GPU (runSpecId=15)")
    void inferRunSpecId_gpuCount4_shouldBeQuadGpu() {
        Long result = scoringService.inferRunSpecIdFromEvalConfig("{\"evalType\": \"OPERATOR\", \"gpuCount\": 4}");
        assertEquals(15L, result);
    }

    @Test
    @DisplayName("#530: gpuCount=8 → 八卡GPU (runSpecId=16)")
    void inferRunSpecId_gpuCount8_shouldBeOctoGpu() {
        Long result = scoringService.inferRunSpecIdFromEvalConfig("{\"gpuCount\": 8}");
        assertEquals(16L, result);
    }

    @Test
    @DisplayName("#530: gpuCount=0 → CPU (runSpecId=11)")
    void inferRunSpecId_gpuCount0_shouldBeCpu() {
        Long result = scoringService.inferRunSpecIdFromEvalConfig("{\"gpuCount\": 0}");
        assertEquals(11L, result);
    }

    @Test
    @DisplayName("#530: no gpuCount field → CPU (runSpecId=11)")
    void inferRunSpecId_noGpuCount_shouldBeCpu() {
        Long result = scoringService.inferRunSpecIdFromEvalConfig("{\"preset\": \"QUICK\"}");
        assertEquals(11L, result);
    }

    @Test
    @DisplayName("#530: null evalConfig → null")
    void inferRunSpecId_nullConfig_shouldBeNull() {
        Long result = scoringService.inferRunSpecIdFromEvalConfig(null);
        assertNull(result);
    }

    @Test
    @DisplayName("#530: empty evalConfig → null")
    void inferRunSpecId_emptyConfig_shouldBeNull() {
        Long result = scoringService.inferRunSpecIdFromEvalConfig("");
        assertNull(result);
    }

    @Test
    @DisplayName("#530: unknown gpuCount → null")
    void inferRunSpecId_unknownGpuCount_shouldBeNull() {
        Long result = scoringService.inferRunSpecIdFromEvalConfig("{\"gpuCount\": 3}");
        assertNull(result);
    }

    @Test
    @DisplayName("#530: resolveRunSpecId uses plan.runSpecId when set")
    void resolveRunSpecId_withExistingSpec_usesIt() {
        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(100L);
        plan.setRunSpecId(15L);
        plan.setEvalConfig("{\"gpuCount\": 1}"); // Different from runSpecId

        Long result = scoringService.resolveRunSpecId(plan);
        assertEquals(15L, result, "Should use existing runSpecId, not infer from evalConfig");
    }

    @Test
    @DisplayName("#530: resolveRunSpecId infers when runSpecId=NULL")
    void resolveRunSpecId_withNullSpec_infersFromConfig() {
        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(101L);
        plan.setPlanNo("PLAN-OLD-001");
        plan.setRunSpecId(null);
        plan.setEvalConfig("{\"evalType\": \"OPERATOR\", \"gpuCount\": 4}");

        Long result = scoringService.resolveRunSpecId(plan);
        assertEquals(15L, result, "Should infer 四卡GPU (15) from gpuCount=4");
    }

    @Test
    @DisplayName("#530: resolveRunSpecId caches inference results")
    void resolveRunSpecId_shouldCacheResults() {
        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(102L);
        plan.setPlanNo("PLAN-OLD-002");
        plan.setRunSpecId(null);
        plan.setEvalConfig("{\"gpuCount\": 8}");

        Long first = scoringService.resolveRunSpecId(plan);
        Long second = scoringService.resolveRunSpecId(plan);
        assertEquals(first, second, "Should return same result from cache");
        assertEquals(16L, first);
    }

    @Test
    @DisplayName("#530: resolveRunSpecId returns null for plan with no config")
    void resolveRunSpecId_noConfig_returnsNull() {
        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(103L);
        plan.setPlanNo("PLAN-OLD-003");
        plan.setRunSpecId(null);
        plan.setEvalConfig(null);

        Long result = scoringService.resolveRunSpecId(plan);
        assertNull(result, "No eval_config and no runSpecId → null");
    }

    @Test
    @DisplayName("#530: resolveRunSpecId returns null for null plan")
    void resolveRunSpecId_nullPlan_returnsNull() {
        Long result = scoringService.resolveRunSpecId(null);
        assertNull(result);
    }

    @Test
    @DisplayName("#530: clearBaselineCache also clears inferred spec cache")
    void clearBaselineCache_clearsInferredCache() {
        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(104L);
        plan.setPlanNo("PLAN-OLD-004");
        plan.setRunSpecId(null);
        plan.setEvalConfig("{\"gpuCount\": 2}");

        // First call caches the inference
        scoringService.resolveRunSpecId(plan);

        // Clear all caches
        scoringService.clearBaselineCache();

        // Change eval_config — but if cache was cleared, it should re-infer
        plan.setEvalConfig("{\"gpuCount\": 8}");
        Long result = scoringService.resolveRunSpecId(plan);
        assertEquals(16L, result, "After cache clear, should re-infer from updated config");
    }
}
