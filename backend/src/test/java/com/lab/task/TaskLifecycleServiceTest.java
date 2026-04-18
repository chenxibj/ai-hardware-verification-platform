package com.lab.task;

import com.lab.gpu.GpuSlotService;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.lab.plan.PlanProgressService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * #489: TaskLifecycleService 统一资源释放测试
 * Updated for #490: includes PlanProgressService (step 3)
 */
@ExtendWith(MockitoExtension.class)
class TaskLifecycleServiceTest {

    @Mock private GpuSlotService gpuSlotService;
    @Mock private ComputeNodeRepository nodeRepository;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private TaskDispatcher taskDispatcher;
    @Mock private PlanProgressService planProgressService;

    @InjectMocks
    private TaskLifecycleService lifecycle;

    private EvaluationTask sampleTask;
    private ComputeNode sampleNode;

    @BeforeEach
    void setUp() {
        sampleTask = new EvaluationTask();
        sampleTask.setId(100L);
        sampleTask.setAssignedNodeId(10L);
        sampleTask.setPlanId(5L);
        sampleTask.setStatus(EvaluationTask.TaskStatus.COMPLETED);

        sampleNode = new ComputeNode();
        sampleNode.setId(10L);
        sampleNode.setName("node-test");
        sampleNode.setStatus(ComputeNode.Status.BUSY);
    }

    // 1. onTaskTerminated 调用后，GPU Slot 被释放
    @Test
    void onTaskTerminated_releasesGpuSlots() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        when(nodeRepository.findById(10L)).thenReturn(Optional.of(sampleNode));

        lifecycle.onTaskTerminated(100L);

        verify(gpuSlotService).releaseGpuSlots(100L);
    }

    // 2. onTaskTerminated 调用后，节点从 BUSY 变 ONLINE
    @Test
    void onTaskTerminated_releasesNodeFromBusyToOnline() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        when(nodeRepository.findById(10L)).thenReturn(Optional.of(sampleNode));

        lifecycle.onTaskTerminated(100L);

        assertEquals(ComputeNode.Status.ONLINE, sampleNode.getStatus());
        verify(nodeRepository).save(sampleNode);
    }

    // 3. onTaskTerminated 调用后，Plan 进度被更新
    @Test
    void onTaskTerminated_updatesPlanProgress() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        when(nodeRepository.findById(10L)).thenReturn(Optional.of(sampleNode));

        lifecycle.onTaskTerminated(100L);

        verify(planProgressService).updateProgress(5L);
    }

    // 4. onTaskTerminated 调用后，tryDispatchNext 被调用
    @Test
    void onTaskTerminated_triggersDispatch() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        when(nodeRepository.findById(10L)).thenReturn(Optional.of(sampleNode));

        lifecycle.onTaskTerminated(100L);

        verify(taskDispatcher).tryDispatchNext();
    }

    // 5. 节点不是 BUSY 状态时不改变状态
    @Test
    void onTaskTerminated_doesNotChangeNonBusyNode() {
        sampleNode.setStatus(ComputeNode.Status.ONLINE);
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        when(nodeRepository.findById(10L)).thenReturn(Optional.of(sampleNode));

        lifecycle.onTaskTerminated(100L);

        assertEquals(ComputeNode.Status.ONLINE, sampleNode.getStatus());
        verify(nodeRepository, never()).save(sampleNode);
    }

    // 6. GPU 释放失败不影响后续步骤（异常隔离）
    @Test
    void onTaskTerminated_gpuFailureDoesNotBlockNodeRelease() {
        doThrow(new RuntimeException("GPU error")).when(gpuSlotService).releaseGpuSlots(100L);
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        when(nodeRepository.findById(10L)).thenReturn(Optional.of(sampleNode));

        lifecycle.onTaskTerminated(100L);

        assertEquals(ComputeNode.Status.ONLINE, sampleNode.getStatus());
        verify(nodeRepository).save(sampleNode);
        verify(planProgressService).updateProgress(5L);
        verify(taskDispatcher).tryDispatchNext();
    }

    // 7. 节点释放失败不影响 Plan 更新和调度触发
    @Test
    void onTaskTerminated_nodeFailureDoesNotBlockPlanAndDispatch() {
        when(taskRepository.findById(100L)).thenThrow(new RuntimeException("DB error"));

        lifecycle.onTaskTerminated(100L);

        verify(gpuSlotService).releaseGpuSlots(100L);
        // task lookup failed, so planId is unknown — plan update skipped
        // But dispatch should still be called
        verify(taskDispatcher).tryDispatchNext();
    }

    // 8. task 没有 assignedNodeId 时跳过节点释放
    @Test
    void onTaskTerminated_skipsNodeReleaseWhenNoAssignedNode() {
        sampleTask.setAssignedNodeId(null);
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));

        lifecycle.onTaskTerminated(100L);

        verify(gpuSlotService).releaseGpuSlots(100L);
        verify(nodeRepository, never()).findById(anyLong());
        verify(planProgressService).updateProgress(5L);
        verify(taskDispatcher).tryDispatchNext();
    }

    // 9. task 不存在时仍释放 GPU 和触发调度
    @Test
    void onTaskTerminated_taskNotFoundStillReleasesGpuAndDispatches() {
        when(taskRepository.findById(999L)).thenReturn(Optional.empty());

        lifecycle.onTaskTerminated(999L);

        verify(gpuSlotService).releaseGpuSlots(999L);
        verify(taskDispatcher).tryDispatchNext();
        // No planId available, so planProgressService not called
        verify(planProgressService, never()).updateProgress(anyLong());
    }

    // 10. 调度触发失败不影响整体
    @Test
    void onTaskTerminated_dispatchFailureDoesNotThrow() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        when(nodeRepository.findById(10L)).thenReturn(Optional.of(sampleNode));
        doThrow(new RuntimeException("dispatch error")).when(taskDispatcher).tryDispatchNext();

        assertDoesNotThrow(() -> lifecycle.onTaskTerminated(100L));
    }

    // 11. planId 为 null 时跳过 plan 更新
    @Test
    void onTaskTerminated_skipsPlanUpdateWhenPlanIdNull() {
        sampleTask.setPlanId(null);
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        when(nodeRepository.findById(10L)).thenReturn(Optional.of(sampleNode));

        lifecycle.onTaskTerminated(100L);

        verify(planProgressService, never()).updateProgress(anyLong());
        verify(gpuSlotService).releaseGpuSlots(100L);
        verify(taskDispatcher).tryDispatchNext();
    }

    // 12. Plan 更新失败不影响调度触发
    @Test
    void onTaskTerminated_planUpdateFailureDoesNotBlockDispatch() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        when(nodeRepository.findById(10L)).thenReturn(Optional.of(sampleNode));
        doThrow(new RuntimeException("plan error")).when(planProgressService).updateProgress(5L);

        lifecycle.onTaskTerminated(100L);

        verify(gpuSlotService).releaseGpuSlots(100L);
        verify(taskDispatcher).tryDispatchNext();
    }

    // 13. 完整调用顺序：GPU → Node → Plan → Dispatch
    @Test
    void onTaskTerminated_fullSequenceInOrder() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        when(nodeRepository.findById(10L)).thenReturn(Optional.of(sampleNode));

        lifecycle.onTaskTerminated(100L);

        var inOrder = inOrder(gpuSlotService, nodeRepository, planProgressService, taskDispatcher);
        inOrder.verify(gpuSlotService).releaseGpuSlots(100L);
        inOrder.verify(nodeRepository).save(sampleNode);
        inOrder.verify(planProgressService).updateProgress(5L);
        inOrder.verify(taskDispatcher).tryDispatchNext();
    }
}
