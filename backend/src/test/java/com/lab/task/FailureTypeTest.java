package com.lab.task;

import com.lab.gpu.GpuSlotService;
import com.lab.node.ComputeNodeRepository;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.chipreport.ChipReportRepository;
import com.lab.chipreport.ReportGeneratorService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * #524: FailureType tests - verify failure_type is set correctly for different scenarios
 */
@ExtendWith(MockitoExtension.class)
class FailureTypeTest {

    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private EvaluationPlanRepository planRepository;
    @Mock private ComputeNodeRepository nodeRepository;
    @Mock private EvaluationResultRepository resultRepository;
    @Mock private TaskDispatcher taskDispatcher;
    @Mock private GpuSlotService gpuSlotService;
    @Mock private TaskLifecycleService lifecycle;
    @Mock private ChipReportRepository chipReportRepository;
    @Mock private ReportGeneratorService reportGeneratorService;

    @InjectMocks
    private TaskRecoveryScheduler scheduler;

    private EvaluationTask makeTask(Long id, EvaluationTask.TaskStatus status, Instant heartbeat, int progress) {
        EvaluationTask task = new EvaluationTask();
        task.setId(id);
        task.setTaskNo("TASK-FT-" + id);
        task.setStatus(status);
        task.setLastHeartbeatAt(heartbeat);
        task.setProgress(progress);
        task.setAssignedNodeId(1L);
        task.setRetryCount(2); // retries exhausted so it goes to FAILED
        return task;
    }

    @Test
    @DisplayName("#524: RUNNING + progress=0 timeout with retries exhausted -> TIMEOUT_NOT_STARTED")
    void timeoutNotStarted_whenProgress0AndRetriesExhausted() {
        Instant staleTime = Instant.now().minus(20, ChronoUnit.MINUTES);
        EvaluationTask task = makeTask(10L, EvaluationTask.TaskStatus.RUNNING, staleTime, 0);

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(List.of(task))
                .thenReturn(List.of(task));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(resultRepository.findByTaskId(10L)).thenReturn(Optional.empty());
        when(resultRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        assertEquals(EvaluationTask.TaskStatus.FAILED, task.getStatus());
        assertEquals(FailureType.TIMEOUT_NOT_STARTED, task.getFailureType());
    }

    @Test
    @DisplayName("#524: RUNNING + progress>0 timeout -> TIMEOUT_IN_PROGRESS")
    void timeoutInProgress_whenProgressGreaterThan0() {
        Instant staleTime = Instant.now().minus(20, ChronoUnit.MINUTES);
        EvaluationTask task = makeTask(11L, EvaluationTask.TaskStatus.RUNNING, staleTime, 50);

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(List.of(task))
                .thenReturn(Collections.emptyList());
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(resultRepository.findByTaskId(11L)).thenReturn(Optional.empty());
        when(resultRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        assertEquals(EvaluationTask.TaskStatus.FAILED, task.getStatus());
        assertEquals(FailureType.TIMEOUT_IN_PROGRESS, task.getFailureType());
    }

    @Test
    @DisplayName("#524: FailureType enum has all expected values")
    void failureTypeEnum_hasAllExpectedValues() {
        assertEquals(4, FailureType.values().length);
        assertNotNull(FailureType.TIMEOUT_NOT_STARTED);
        assertNotNull(FailureType.TIMEOUT_IN_PROGRESS);
        assertNotNull(FailureType.AGENT_ERROR);
        assertNotNull(FailureType.EVAL_FAILED);
    }

    @Test
    @DisplayName("#524: EvaluationTask has failureType field")
    void evaluationTask_hasFailureTypeField() {
        EvaluationTask task = new EvaluationTask();
        assertNull(task.getFailureType());

        task.setFailureType(FailureType.AGENT_ERROR);
        assertEquals(FailureType.AGENT_ERROR, task.getFailureType());
    }
}
