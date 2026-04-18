package com.lab.task;

import com.lab.gpu.GpuSlotService;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResultRepository;
import com.lab.scoring.ReportGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * #451: TaskRecoveryScheduler 测试 — 验证 DISPATCHED 超时回退逻辑
 */
@ExtendWith(MockitoExtension.class)
class TaskRecoverySchedulerTest {

    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private EvaluationPlanRepository planRepository;
    @Mock private ComputeNodeRepository nodeRepository;
    @Mock private EvaluationResultRepository resultRepository;
    @Mock private TaskDispatcher taskDispatcher;
    @Mock private ReportGenerator reportGenerator;
    @Mock private GpuSlotService gpuSlotService;
    @Mock private TaskLifecycleService lifecycle;

    @InjectMocks
    private TaskRecoveryScheduler scheduler;

    private EvaluationTask makeTask(Long id, EvaluationTask.TaskStatus status, Instant heartbeat) {
        EvaluationTask task = new EvaluationTask();
        task.setId(id);
        task.setTaskNo("TASK-TEST-" + id);
        task.setStatus(status);
        task.setLastHeartbeatAt(heartbeat);
        task.setProgress(0);
        task.setAssignedNodeId(1L);
        return task;
    }

    @Test
    @DisplayName("#451: DISPATCHED 超过 2 分钟应回退为 QUEUED")
    void recoverStaleDispatchedTasks_shouldRollbackToQueued() {
        Instant staleTime = Instant.now().minus(5, ChronoUnit.MINUTES);
        EvaluationTask staleTask = makeTask(1L, EvaluationTask.TaskStatus.DISPATCHED, staleTime);

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.DISPATCHED), any(Instant.class)))
                .thenReturn(List.of(staleTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleDispatchedTasks();

        assertEquals(EvaluationTask.TaskStatus.QUEUED, staleTask.getStatus());
        assertNull(staleTask.getAssignedNodeId());
        assertNull(staleTask.getStartedAt());
        assertNull(staleTask.getLastHeartbeatAt());
        assertNotNull(staleTask.getQueueReason());
        assertTrue(staleTask.getQueueReason().contains("DISPATCHED 超时"));
        verify(gpuSlotService).releaseGpuSlots(1L);
        verify(taskDispatcher).tryDispatchNext();
    }

    @Test
    @DisplayName("#451: 新鲜的 DISPATCHED 任务不应被回退")
    void recoverStaleDispatchedTasks_shouldNotTouchFreshTasks() {
        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.DISPATCHED), any(Instant.class)))
                .thenReturn(Collections.emptyList());

        scheduler.recoverStaleDispatchedTasks();

        verify(taskRepository, never()).save(any());
    }

    @Test
    @DisplayName("#451: RUNNING + progress=0 超过 5 分钟应标记 FAILED")
    void recoverStaleRunningTasks_progress0_shouldFail() {
        Instant staleTime = Instant.now().minus(6, ChronoUnit.MINUTES);
        EvaluationTask stuckTask = makeTask(2L, EvaluationTask.TaskStatus.RUNNING, staleTime);
        stuckTask.setProgress(0);

        // 15min threshold returns empty, 5min threshold returns our task
        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(Collections.emptyList())   // first call (15min)
                .thenReturn(List.of(stuckTask));        // second call (5min)
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        assertEquals(EvaluationTask.TaskStatus.FAILED, stuckTask.getStatus());
        assertNotNull(stuckTask.getErrorMessage());
        assertTrue(stuckTask.getErrorMessage().contains("progress=0"));
    }

    @Test
    @DisplayName("#451: RUNNING + progress>0 在 5-15 分钟范围内不应被终止")
    void recoverStaleRunningTasks_withProgress_shouldNotFailEarly() {
        Instant sixMinAgo = Instant.now().minus(6, ChronoUnit.MINUTES);
        EvaluationTask activeTask = makeTask(3L, EvaluationTask.TaskStatus.RUNNING, sixMinAgo);
        activeTask.setProgress(50);  // Has progress, not stuck

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(Collections.emptyList())    // 15min
                .thenReturn(List.of(activeTask));        // 5min

        scheduler.recoverStaleRunningTasks();

        // progress > 0, should NOT be failed at 5min mark
        assertEquals(EvaluationTask.TaskStatus.RUNNING, activeTask.getStatus());
    }
}
