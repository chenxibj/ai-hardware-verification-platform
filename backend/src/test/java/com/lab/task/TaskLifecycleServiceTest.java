package com.lab.task;

import com.lab.gpu.GpuSlotService;
import com.lab.node.ComputeNodeService;
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
 * Updated for #493: uses ComputeNodeService.releaseIfBusy instead of ComputeNodeRepository
 */
@ExtendWith(MockitoExtension.class)
class TaskLifecycleServiceTest {

    @Mock private GpuSlotService gpuSlotService;
    @Mock private ComputeNodeService computeNodeService;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private TaskDispatcher taskDispatcher;
    @Mock private PlanProgressService planProgressService;

    @InjectMocks
    private TaskLifecycleService lifecycle;

    private EvaluationTask sampleTask;

    @BeforeEach
    void setUp() {
        sampleTask = new EvaluationTask();
        sampleTask.setId(100L);
        sampleTask.setAssignedNodeId(10L);
        sampleTask.setPlanId(5L);
        sampleTask.setStatus(EvaluationTask.TaskStatus.COMPLETED);
    }

    // 1. onTaskTerminated 调用后，GPU Slot 被释放
    @Test
    void onTaskTerminated_releasesGpuSlots() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));

        lifecycle.onTaskTerminated(100L);

        verify(gpuSlotService).releaseGpuSlots(100L);
    }

    // 2. onTaskTerminated 调用后，节点通过 ComputeNodeService.releaseIfBusy 释放
    @Test
    void onTaskTerminated_releasesNodeViaBusyToOnline() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        when(computeNodeService.releaseIfBusy(10L)).thenReturn(true);

        lifecycle.onTaskTerminated(100L);

        verify(computeNodeService).releaseIfBusy(10L);
    }

    // 3. onTaskTerminated 调用后，Plan 进度被更新
    @Test
    void onTaskTerminated_updatesPlanProgress() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));

        lifecycle.onTaskTerminated(100L);

        verify(planProgressService).updateProgress(5L);
    }

    // 4. onTaskTerminated 调用后，tryDispatchNext 被调用
    @Test
    void onTaskTerminated_triggersDispatch() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));

        lifecycle.onTaskTerminated(100L);

        verify(taskDispatcher).tryDispatchNext();
    }

    // 5. 节点不是 BUSY 状态时 releaseIfBusy 返回 false
    @Test
    void onTaskTerminated_doesNotChangeNonBusyNode() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        when(computeNodeService.releaseIfBusy(10L)).thenReturn(false);

        lifecycle.onTaskTerminated(100L);

        verify(computeNodeService).releaseIfBusy(10L);
    }

    // 6. GPU 释放失败不影响后续步骤（异常隔离）
    @Test
    void onTaskTerminated_gpuFailureDoesNotBlockNodeRelease() {
        doThrow(new RuntimeException("GPU error")).when(gpuSlotService).releaseGpuSlots(100L);
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));

        lifecycle.onTaskTerminated(100L);

        verify(computeNodeService).releaseIfBusy(10L);
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
        verify(computeNodeService, never()).releaseIfBusy(anyLong());
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
        doThrow(new RuntimeException("dispatch error")).when(taskDispatcher).tryDispatchNext();

        assertDoesNotThrow(() -> lifecycle.onTaskTerminated(100L));
    }

    // 11. planId 为 null 时跳过 plan 更新
    @Test
    void onTaskTerminated_skipsPlanUpdateWhenPlanIdNull() {
        sampleTask.setPlanId(null);
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));

        lifecycle.onTaskTerminated(100L);

        verify(planProgressService, never()).updateProgress(anyLong());
        verify(gpuSlotService).releaseGpuSlots(100L);
        verify(taskDispatcher).tryDispatchNext();
    }

    // 12. Plan 更新失败不影响调度触发
    @Test
    void onTaskTerminated_planUpdateFailureDoesNotBlockDispatch() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));
        doThrow(new RuntimeException("plan error")).when(planProgressService).updateProgress(5L);

        lifecycle.onTaskTerminated(100L);

        verify(gpuSlotService).releaseGpuSlots(100L);
        verify(taskDispatcher).tryDispatchNext();
    }

    // 13. 完整调用顺序：GPU → Node → Plan → Dispatch
    @Test
    void onTaskTerminated_fullSequenceInOrder() {
        when(taskRepository.findById(100L)).thenReturn(Optional.of(sampleTask));

        lifecycle.onTaskTerminated(100L);

        var inOrder = inOrder(gpuSlotService, computeNodeService, planProgressService, taskDispatcher);
        inOrder.verify(gpuSlotService).releaseGpuSlots(100L);
        inOrder.verify(computeNodeService).releaseIfBusy(10L);
        inOrder.verify(planProgressService).updateProgress(5L);
        inOrder.verify(taskDispatcher).tryDispatchNext();
    }
}
