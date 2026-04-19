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
 * 
 * 根因：poll-tasks 在后端将 DISPATCHED->RUNNING 后，如果 Agent 未收到 HTTP 响应
 * （网络闪断、超时、Agent 重启等），任务留在 RUNNING+progress=0 无人执行。
 * 修复：progress=0 的超时任务先回退为 QUEUED 重试（最多 2 次），而非直接 FAILED。
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

        assertEquals(EvaluationTask.TaskStatus.QUEUED, task.getStatus(),
                "progress=0 task should be re-queued, not failed");
        assertEquals(1, task.getRetryCount(), "retryCount should increment to 1");
        assertNull(task.getAssignedNodeId(), "nodeId should be cleared");
        assertNull(task.getStartedAt(), "startedAt should be cleared");
        assertNull(task.getLastHeartbeatAt(), "lastHeartbeatAt should be cleared");
        assertNull(task.getAllocatedGpuIndices(), "GPU indices should be cleared");
        assertTrue(task.getQueueReason().contains("#509"), "queueReason should reference #509");
        verify(gpuSlotService).releaseGpuSlots(1L);
        verify(taskDispatcher).tryDispatchNext();
        // Should NOT create a timeout result
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

        assertEquals(EvaluationTask.TaskStatus.QUEUED, task.getStatus(),
                "Should still re-queue on second retry");
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

        assertEquals(EvaluationTask.TaskStatus.FAILED, task.getStatus(),
                "Should fail after exhausting retries");
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

        assertEquals(EvaluationTask.TaskStatus.FAILED, task.getStatus(),
                "Tasks with progress should still fail after 15min");
        assertEquals(0, task.getRetryCount(), "retryCount should not change for progress>0");
    }

    @Test
    @DisplayName("#509: progress=0 + retryCount=null (旧数据兼容) -> QUEUED")
    void progress0_retryNull_shouldRequeue() {
        Instant sixMinAgo = Instant.now().minus(6, ChronoUnit.MINUTES);
        EvaluationTask task = makeTask(5L, EvaluationTask.TaskStatus.RUNNING, sixMinAgo, 0, 0);
        task.setRetryCount(null);  // Simulate old data without retryCount

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(Collections.emptyList())
                .thenReturn(List.of(task));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        assertEquals(EvaluationTask.TaskStatus.QUEUED, task.getStatus(),
                "Null retryCount should be treated as 0");
        assertEquals(1, task.getRetryCount());
    }

    @Test
    @DisplayName("#509: 多个混合任务 — 验证分别处理")
    void mixedTasks_shouldHandleIndividually() {
        Instant sixMinAgo = Instant.now().minus(6, ChronoUnit.MINUTES);
        Instant twentyMinAgo = Instant.now().minus(20, ChronoUnit.MINUTES);

        // progress=0, retry 0 -> should requeue
        EvaluationTask requeueable = makeTask(10L, EvaluationTask.TaskStatus.RUNNING, sixMinAgo, 0, 0);
        // progress=0, retry 2 -> should fail
        EvaluationTask exhausted = makeTask(11L, EvaluationTask.TaskStatus.RUNNING, sixMinAgo, 0, 2);
        // progress=50, stale 20min -> should fail
        EvaluationTask progressed = makeTask(12L, EvaluationTask.TaskStatus.RUNNING, twentyMinAgo, 50, 0);

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(List.of(progressed))       // 15min threshold
                .thenReturn(List.of(requeueable, exhausted, progressed));  // 5min threshold
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        assertEquals(EvaluationTask.TaskStatus.QUEUED, requeueable.getStatus());
        assertEquals(EvaluationTask.TaskStatus.FAILED, exhausted.getStatus());
        assertEquals(EvaluationTask.TaskStatus.FAILED, progressed.getStatus());
    }
}
