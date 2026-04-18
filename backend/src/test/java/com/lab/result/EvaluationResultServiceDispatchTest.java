package com.lab.result;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.scoring.ScoringService;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.task.TaskLifecycleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EvaluationResultServiceDispatchTest {

    @Mock private EvaluationResultRepository resultRepository;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private EvaluationPlanRepository planRepository;
    @Spy  private ObjectMapper objectMapper = new ObjectMapper();
    @Mock private ScoringService scoringService;
    @Mock private TaskLifecycleService lifecycle;

    @InjectMocks
    private EvaluationResultService evaluationResultService;

    private EvaluationTask makeTask(Long id) {
        EvaluationTask task = new EvaluationTask();
        task.setId(id);
        task.setTaskNo("TASK-TEST-" + id);
        task.setStatus(EvaluationTask.TaskStatus.RUNNING);
        task.setTestSubject(EvaluationTask.TestSubject.OPERATOR);
        task.setAssignedNodeId(1L);
        return task;
    }

    @BeforeEach
    void setup() {
        when(resultRepository.save(any(EvaluationResult.class)))
                .thenAnswer(inv -> {
                    EvaluationResult r = inv.getArgument(0);
                    r.setId(100L);
                    return r;
                });
        when(taskRepository.save(any(EvaluationTask.class)))
                .thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    @DisplayName("#489: submitResult should trigger lifecycle.onTaskTerminated")
    void submitResult_shouldTriggerDispatch() {
        EvaluationTask task = makeTask(1L);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(task));

        String rawData = "{\"status\":\"COMPLETED\",\"result\":{\"eval_result\":{\"summary\":{\"pass_rate\":100}}}}";
        evaluationResultService.submitResult(1L, rawData);

        verify(lifecycle, times(1)).onTaskTerminated(1L);
    }

    @Test
    @DisplayName("#489: submitFailure should trigger lifecycle.onTaskTerminated")
    void submitFailure_shouldTriggerDispatch() {
        EvaluationTask task = makeTask(2L);
        when(taskRepository.findById(2L)).thenReturn(Optional.of(task));

        evaluationResultService.submitFailure(2L, "Some error occurred");

        verify(lifecycle, times(1)).onTaskTerminated(2L);
    }

    @Test
    @DisplayName("#489: lifecycle failure should not affect result submission")
    void submitResult_dispatchFailure_shouldNotAffectResult() {
        EvaluationTask task = makeTask(3L);
        when(taskRepository.findById(3L)).thenReturn(Optional.of(task));
        doThrow(new RuntimeException("Lifecycle error")).when(lifecycle).onTaskTerminated(3L);

        String rawData = "{\"status\":\"COMPLETED\",\"result\":{\"eval_result\":{\"summary\":{\"pass_rate\":100}}}}";
        // Should not throw even though lifecycle fails
        EvaluationResult result = evaluationResultService.submitResult(3L, rawData);
        assertNotNull(result);
        verify(lifecycle, times(1)).onTaskTerminated(3L);
    }
}
