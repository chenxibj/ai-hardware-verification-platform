package com.lab.task;

import com.lab.gpu.GpuSlotService;
import com.lab.node.ComputeNode;
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
 * #497: 验证 OFFLINE 节点任务回收 + GPU Slot 释放
 */
@ExtendWith(MockitoExtension.class)
class OfflineNodeRecoveryTest {

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

    private ComputeNode makeOfflineNode(Long id, String name) {
        ComputeNode node = new ComputeNode();
        node.setId(id);
        node.setName(name);
        node.setStatus(ComputeNode.Status.OFFLINE);
        node.setLastHeartbeat(Instant.now().minus(5, ChronoUnit.MINUTES));
        return node;
    }

    private EvaluationTask makeTask(Long id, EvaluationTask.TaskStatus status, Long nodeId) {
        EvaluationTask task = new EvaluationTask();
        task.setId(id);
        task.setTaskNo("TASK-TEST-" + id);
        task.setStatus(status);
        task.setAssignedNodeId(nodeId);
        task.setStartedAt(Instant.now().minus(10, ChronoUnit.MINUTES));
        task.setLastHeartbeatAt(Instant.now().minus(10, ChronoUnit.MINUTES));
        task.setProgress(0);
        return task;
    }

    @Test
    @DisplayName("#497: OFFLINE node RUNNING tasks -> QUEUED + GPU slots released")
    void offlineNode_runningTasks_recoveredAndGpuReleased() {
        ComputeNode offlineNode = makeOfflineNode(1L, "gpu-node-1");
        EvaluationTask runningTask = makeTask(100L, EvaluationTask.TaskStatus.RUNNING, 1L);
        EvaluationTask dispatchedTask = makeTask(101L, EvaluationTask.TaskStatus.DISPATCHED, 1L);

        when(nodeRepository.findByStatus(ComputeNode.Status.OFFLINE))
                .thenReturn(List.of(offlineNode));
        when(taskRepository.findByAssignedNodeId(1L))
                .thenReturn(List.of(runningTask, dispatchedTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverOfflineNodeTasks();

        assertEquals(EvaluationTask.TaskStatus.QUEUED, runningTask.getStatus());
        assertEquals(EvaluationTask.TaskStatus.QUEUED, dispatchedTask.getStatus());
        assertNull(runningTask.getAssignedNodeId());
        assertNull(dispatchedTask.getAssignedNodeId());

        verify(gpuSlotService).releaseGpuSlots(100L);
        verify(gpuSlotService).releaseGpuSlots(101L);
        verify(taskDispatcher).tryDispatchNext();
    }

    @Test
    @DisplayName("#497: OFFLINE node with COMPLETED task -> not touched")
    void offlineNode_completedTask_notTouched() {
        ComputeNode offlineNode = makeOfflineNode(2L, "gpu-node-2");
        EvaluationTask completedTask = makeTask(200L, EvaluationTask.TaskStatus.COMPLETED, 2L);

        when(nodeRepository.findByStatus(ComputeNode.Status.OFFLINE))
                .thenReturn(List.of(offlineNode));
        when(taskRepository.findByAssignedNodeId(2L))
                .thenReturn(List.of(completedTask));

        scheduler.recoverOfflineNodeTasks();

        assertEquals(EvaluationTask.TaskStatus.COMPLETED, completedTask.getStatus());
        verify(taskRepository, never()).save(any());
        verify(gpuSlotService, never()).releaseGpuSlots(anyLong());
    }

    @Test
    @DisplayName("#497: RUNNING task over 30 min with no progress update -> FAILED")
    void runningTask_30minNoProgress_markedFailed() {
        Instant staleTime = Instant.now().minus(31, ChronoUnit.MINUTES);
        EvaluationTask staleTask = new EvaluationTask();
        staleTask.setId(300L);
        staleTask.setTaskNo("TASK-TEST-300");
        staleTask.setStatus(EvaluationTask.TaskStatus.RUNNING);
        staleTask.setLastHeartbeatAt(staleTime);
        staleTask.setProgress(50);
        staleTask.setAssignedNodeId(1L);

        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(List.of(staleTask))
                .thenReturn(List.of(staleTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        assertEquals(EvaluationTask.TaskStatus.FAILED, staleTask.getStatus());
        assertNotNull(staleTask.getErrorMessage());
        verify(lifecycle).onTaskTerminated(300L);
    }

    @Test
    @DisplayName("#497: No OFFLINE nodes -> no recovery needed")
    void noOfflineNodes_noRecovery() {
        when(nodeRepository.findByStatus(ComputeNode.Status.OFFLINE))
                .thenReturn(Collections.emptyList());

        scheduler.recoverOfflineNodeTasks();

        verify(taskRepository, never()).findByAssignedNodeId(anyLong());
        verify(taskDispatcher, never()).tryDispatchNext();
    }
}
