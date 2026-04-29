package com.lab.result;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.scoring.ScoringService;
import com.lab.task.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * #548: Verify that null chipId / null planId don't cause exceptions.
 * After the NOT NULL constraints are dropped, saving with null values should succeed.
 */
class NotNullConstraintFixTest {

    private EvaluationResultRepository resultRepository;
    private EvaluationTaskRepository taskRepository;
    private EvaluationPlanRepository planRepository;
    private ObjectMapper objectMapper;
    private ScoringService scoringService;
    private TaskLifecycleService lifecycle;
    private MetricsNormalizer metricsNormalizer;
    private EvaluationResultService service;

    @BeforeEach
    void setUp() {
        resultRepository = mock(EvaluationResultRepository.class);
        taskRepository = mock(EvaluationTaskRepository.class);
        planRepository = mock(EvaluationPlanRepository.class);
        objectMapper = new ObjectMapper();
        scoringService = mock(ScoringService.class);
        lifecycle = mock(TaskLifecycleService.class);
        metricsNormalizer = mock(MetricsNormalizer.class);
        service = new EvaluationResultService(
                resultRepository, taskRepository, planRepository,
                objectMapper, scoringService, lifecycle, metricsNormalizer);
    }

    @Test
    @DisplayName("#548: submitResult with null chipId (no plan fallback) should save successfully")
    void submitResult_nullChipId_noPlanFallback_savesWithNull() {
        EvaluationTask task = new EvaluationTask();
        task.setId(200L);
        task.setChipId(null);  // No chipId on task
        task.setPlanId(null);  // No planId either — can't fall back
        task.setStatus(EvaluationTask.TaskStatus.RUNNING);
        task.setTestItem("MatMul");

        when(taskRepository.findById(200L)).thenReturn(Optional.of(task));
        when(resultRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(scoringService.scoreFromMetrics(anyString(), anyString())).thenReturn(75.0);
        when(metricsNormalizer.normalize(anyString())).thenReturn(Map.of("dataStatus", "HAS_DATA"));

        String rawData = "{\"status\":\"COMPLETED\",\"result\":{\"eval_result\":{\"summary\":{\"avg_latency_ms\":1.5},\"results\":[]}}}";
        EvaluationResult result = service.submitResult(200L, rawData);

        assertNotNull(result);
        assertNull(result.getChipId(), "chipId should be null when no fallback available");
        assertNull(result.getPlanId(), "planId should be null");
        assertEquals(200L, result.getTaskId());
    }

    @Test
    @DisplayName("#548: submitResult with null chipId but plan has chipId should resolve from plan")
    void submitResult_nullChipId_resolvedFromPlan() {
        EvaluationTask task = new EvaluationTask();
        task.setId(201L);
        task.setChipId(null);
        task.setPlanId(10L);
        task.setStatus(EvaluationTask.TaskStatus.RUNNING);
        task.setTestItem("Conv2D");

        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(10L);
        plan.setChipId(42L);

        when(taskRepository.findById(201L)).thenReturn(Optional.of(task));
        when(planRepository.findById(10L)).thenReturn(Optional.of(plan));
        when(resultRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(scoringService.scoreFromMetrics(anyString(), anyString())).thenReturn(80.0);
        when(metricsNormalizer.normalize(anyString())).thenReturn(Map.of("dataStatus", "HAS_DATA"));

        String rawData = "{\"status\":\"COMPLETED\",\"result\":{\"eval_result\":{\"summary\":{\"avg_latency_ms\":2.0},\"results\":[]}}}";
        EvaluationResult result = service.submitResult(201L, rawData);

        assertNotNull(result);
        assertEquals(42L, result.getChipId(), "chipId should be resolved from plan");
    }

    @Test
    @DisplayName("#548: submitFailure with null chipId should save successfully")
    void submitFailure_nullChipId_savesWithNull() {
        EvaluationTask task = new EvaluationTask();
        task.setId(300L);
        task.setChipId(null);
        task.setPlanId(null);
        task.setStatus(EvaluationTask.TaskStatus.RUNNING);

        when(taskRepository.findById(300L)).thenReturn(Optional.of(task));
        when(resultRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EvaluationResult result = service.submitFailure(300L, "OOM during evaluation");

        assertNotNull(result);
        assertNull(result.getChipId(), "chipId should be null");
        assertNull(result.getPlanId(), "planId should be null");
        assertFalse(result.getPassed());
        assertEquals("OOM during evaluation", result.getErrorMessage());
    }

    @Test
    @DisplayName("#548: submitFailure with null chipId resolves from plan")
    void submitFailure_nullChipId_resolvedFromPlan() {
        EvaluationTask task = new EvaluationTask();
        task.setId(301L);
        task.setChipId(null);
        task.setPlanId(20L);
        task.setStatus(EvaluationTask.TaskStatus.RUNNING);

        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(20L);
        plan.setChipId(99L);

        when(taskRepository.findById(301L)).thenReturn(Optional.of(task));
        when(planRepository.findById(20L)).thenReturn(Optional.of(plan));
        when(resultRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EvaluationResult result = service.submitFailure(301L, "GPU error");

        assertNotNull(result);
        assertEquals(99L, result.getChipId(), "chipId should be resolved from plan");
    }

    @Test
    @DisplayName("#548: resultRepository.save is called with correct chipId (null or resolved)")
    void submitResult_repositorySaveCalledWithCorrectChipId() {
        EvaluationTask task = new EvaluationTask();
        task.setId(400L);
        task.setChipId(null);
        task.setPlanId(null);
        task.setStatus(EvaluationTask.TaskStatus.RUNNING);
        task.setTestItem("Softmax");

        when(taskRepository.findById(400L)).thenReturn(Optional.of(task));
        when(resultRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(scoringService.scoreFromMetrics(anyString(), anyString())).thenReturn(65.0);
        when(metricsNormalizer.normalize(anyString())).thenReturn(Map.of("dataStatus", "HAS_DATA"));

        String rawData = "{\"result\":{\"eval_result\":{\"summary\":{\"avg_latency_ms\":3.0},\"results\":[]}}}";
        service.submitResult(400L, rawData);

        ArgumentCaptor<EvaluationResult> captor = ArgumentCaptor.forClass(EvaluationResult.class);
        verify(resultRepository).save(captor.capture());
        EvaluationResult saved = captor.getValue();
        assertNull(saved.getChipId(), "Saved result should have null chipId");
        assertEquals(400L, saved.getTaskId());
    }
}
