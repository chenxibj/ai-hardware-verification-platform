package com.lab.result;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.scoring.ScoringService;
import com.lab.task.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * #524: submitFailure should set failureType = AGENT_ERROR
 */
@ExtendWith(MockitoExtension.class)
class SubmitFailureTypeTest {

    @Mock private EvaluationResultRepository resultRepository;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private EvaluationPlanRepository planRepository;
    @Mock private ObjectMapper objectMapper;
    @Mock private ScoringService scoringService;
    @Mock private TaskLifecycleService lifecycle;
    @Mock private MetricsNormalizer metricsNormalizer;

    @InjectMocks
    private EvaluationResultService service;

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
