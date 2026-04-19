package com.lab.result;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.scoring.ScoringService;
import com.lab.task.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * #524: submitFailure should set failureType = AGENT_ERROR
 */
class SubmitFailureTypeTest {

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
        objectMapper = mock(ObjectMapper.class);
        scoringService = mock(ScoringService.class);
        lifecycle = mock(TaskLifecycleService.class);
        metricsNormalizer = mock(MetricsNormalizer.class);
        service = new EvaluationResultService(
                resultRepository, taskRepository, planRepository,
                objectMapper, scoringService, lifecycle, metricsNormalizer);
    }

    @Test
    @DisplayName("#524: submitFailure sets failureType = AGENT_ERROR")
    void submitFailure_setsAgentErrorFailureType() {
        EvaluationTask task = new EvaluationTask();
        task.setId(100L);
        task.setStatus(EvaluationTask.TaskStatus.RUNNING);
        task.setPlanId(1L);

        when(taskRepository.findById(100L)).thenReturn(Optional.of(task));
        when(resultRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.submitFailure(100L, "Agent crash: OOM");

        assertEquals(EvaluationTask.TaskStatus.FAILED, task.getStatus());
        assertEquals(FailureType.AGENT_ERROR, task.getFailureType());
    }
}
