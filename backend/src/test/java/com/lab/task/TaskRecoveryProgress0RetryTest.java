package com.lab.task;

import com.lab.gpu.GpuSlotService;
import com.lab.node.ComputeNodeRepository;
import com.lab.plan.EvaluationPlanRepository;
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

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * #509: progress=0 超时任务应回退重试而非直接失败
 */
@ExtendWith(MockitoExtension.class)
class TaskRecoveryProgress0RetryTest {

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

    private EvaluationTask makeTask(Long id, EvaluationTask.TaskStatus status,
                                     Instant heartbeat, int progress, int retryCount) {
        EvaluationTask task = new EvaluationTask();
        task.setId(id);
        task.setTaskNo("TASK-509-" + id);
        task.setStatus(status);
        task.setLastHeartbeatAt(heartbeat);
        task.setProgress(progress);
        task.setAssignedNodeId(18L);
        task.setRetryCount(retryCount);
        task.setAllocatedGpuIndices("[0]");
        return task;
    }

    @Test
    @DisplayName("#509: progress=0 + retryCount=0 -> QUEUED (第一次重试)")
    void progress0_retry0_shouldRequeue() {
        Instant sixMinAgo = Instant.now().minus(6, ChronoUnit.MINUTES);
        EvaluationTask task = makeTask(1L, EvaluationTask.TaskStatus.RUNNING, sixMinAgo, 0, 0);

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(Collections.emptyList())
                .thenReturn(List.of(task));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        assertEquals(EvaluationTask.TaskStatus.QUEUED, task.getStatus());
        assertEquals(1, task.getRetryCount());
        assertNull(task.getAssignedNodeId());
        assertNull(task.getStartedAt());
        assertNull(task.getLastHeartbeatAt());
        assertNull(task.getAllocatedGpuIndices());
        assertTrue(task.getQueueReason().contains("#509"));
        verify(gpuSlotService).releaseGpuSlots(1L);
        verify(taskDispatcher).tryDispatchNext();
        verify(resultRepository, never()).findByTaskId(any());
    }

    @Test
    @DisplayName("#509: progress=0 + retryCount=1 -> QUEUED (第二次重试)")
    void progress0_retry1_shouldRequeueAgain() {
        Instant sixMinAgo = Instant.now().minus(6, ChronoUnit.MINUTES);
        EvaluationTask task = makeTask(2L, EvaluationTask.TaskStatus.RUNNING, sixMinAgo, 0, 1);

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(Collections.emptyList())
                .thenReturn(List.of(task));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        assertEquals(EvaluationTask.TaskStatus.QUEUED, task.getStatus());
        assertEquals(2, task.getRetryCount());
    }

    @Test
    @DisplayName("#509: progress=0 + retryCount=2 -> FAILED (重试次数用尽)")
    void progress0_retry2_shouldFail() {
        Instant sixMinAgo = Instant.now().minus(6, ChronoUnit.MINUTES);
        EvaluationTask task = makeTask(3L, EvaluationTask.TaskStatus.RUNNING, sixMinAgo, 0, 2);

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(Collections.emptyList())
                .thenReturn(List.of(task));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        assertEquals(EvaluationTask.TaskStatus.FAILED, task.getStatus());
        assertNotNull(task.getErrorMessage());
        assertTrue(task.getErrorMessage().contains("progress=0"));
        verify(lifecycle).onTaskTerminated(3L);
    }

    @Test
    @DisplayName("#509: progress>0 超过 15min -> FAILED (不走重试逻辑)")
    void progressNonZero_stale15min_shouldFailDirectly() {
        Instant twentyMinAgo = Instant.now().minus(20, ChronoUnit.MINUTES);
        EvaluationTask task = makeTask(4L, EvaluationTask.TaskStatus.RUNNING, twentyMinAgo, 50, 0);

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(List.of(task))
                .thenReturn(Collections.emptyList());
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        assertEquals(EvaluationTask.TaskStatus.FAILED, task.getStatus());
        assertEquals(0, task.getRetryCount());
    }

    @Test
    @DisplayName("#509: progress=0 + retryCount=null (旧数据兼容) -> QUEUED")
    void progress0_retryNull_shouldRequeue() {
        Instant sixMinAgo = Instant.now().minus(6, ChronoUnit.MINUTES);
        EvaluationTask task = makeTask(5L, EvaluationTask.TaskStatus.RUNNING, sixMinAgo, 0, 0);
        task.setRetryCount(null);

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(Collections.emptyList())
                .thenReturn(List.of(task));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        assertEquals(EvaluationTask.TaskStatus.QUEUED, task.getStatus());
        assertEquals(1, task.getRetryCount());
    }

    @Test
    @DisplayName("#509: 多个混合任务 — 验证分别处理")
    void mixedTasks_shouldHandleIndividually() {
        Instant sixMinAgo = Instant.now().minus(6, ChronoUnit.MINUTES);
        Instant twentyMinAgo = Instant.now().minus(20, ChronoUnit.MINUTES);

        EvaluationTask requeueable = makeTask(10L, EvaluationTask.TaskStatus.RUNNING, sixMinAgo, 0, 0);
        EvaluationTask exhausted = makeTask(11L, EvaluationTask.TaskStatus.RUNNING, sixMinAgo, 0, 2);
        EvaluationTask progressed = makeTask(12L, EvaluationTask.TaskStatus.RUNNING, twentyMinAgo, 50, 0);

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(List.of(progressed))
                .thenReturn(List.of(requeueable, exhausted, progressed));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        assertEquals(EvaluationTask.TaskStatus.QUEUED, requeueable.getStatus());
        assertEquals(EvaluationTask.TaskStatus.FAILED, exhausted.getStatus());
        assertEquals(EvaluationTask.TaskStatus.FAILED, progressed.getStatus());
    }
}
