package com.lab.plan;

import com.lab.chip.ChipRepository;
import com.lab.chipreport.ChipReportRepository;
import com.lab.gpu.GpuSlotService;
import com.lab.result.EvaluationResultRepository;
import com.lab.runspec.RunSpecRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.task.TaskDispatcher;
import com.lab.template.TaskTemplateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * #499: 验证 Plan 取消时 GPU Slot 释放
 */
@ExtendWith(MockitoExtension.class)
class PlanCancelGpuSlotTest {

    @Mock private EvaluationPlanRepository planRepository;
    @Mock private ChipRepository chipRepository;
    @Mock private TaskTemplateRepository templateRepository;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private EvaluationResultRepository resultRepository;
    @Mock private ChipReportRepository chipReportRepository;
    @Mock private PlanTaskSplitter planTaskSplitter;
    @Mock private TaskDispatcher taskDispatcher;
    @Mock private GpuSlotService gpuSlotService;
    @Mock private RunSpecRepository runSpecRepository;

    @InjectMocks
    private EvaluationPlanService planService;

    private EvaluationPlan makeRunningPlan(Long id) {
        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(id);
        plan.setPlanNo("PLAN-TEST-" + id);
        plan.setStatus(EvaluationPlan.PlanStatus.RUNNING);
        plan.setChipId(1L);
        return plan;
    }

    private EvaluationTask makeTask(Long id, EvaluationTask.TaskStatus status) {
        EvaluationTask task = new EvaluationTask();
        task.setId(id);
        task.setTaskNo("TASK-TEST-" + id);
        task.setStatus(status);
        task.setAssignedNodeId(1L);
        return task;
    }

    @Test
    @DisplayName("#499: cancelPlan releases GPU for ALL non-terminal tasks, not just RUNNING/DISPATCHED")
    void cancelPlan_releasesGpuForAllTasks() {
        EvaluationPlan plan = makeRunningPlan(1L);

        EvaluationTask runningTask = makeTask(100L, EvaluationTask.TaskStatus.RUNNING);
        EvaluationTask dispatchedTask = makeTask(101L, EvaluationTask.TaskStatus.DISPATCHED);
        EvaluationTask queuedTask = makeTask(102L, EvaluationTask.TaskStatus.QUEUED);
        EvaluationTask pausedTask = makeTask(103L, EvaluationTask.TaskStatus.PAUSED);

        when(planRepository.findById(1L)).thenReturn(Optional.of(plan));
        when(planRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        when(taskRepository.findByPlanIdAndStatus(1L, EvaluationTask.TaskStatus.RUNNING))
                .thenReturn(List.of(runningTask));
        when(taskRepository.findByPlanIdAndStatus(1L, EvaluationTask.TaskStatus.DISPATCHED))
                .thenReturn(List.of(dispatchedTask));
        when(taskRepository.findByPlanIdAndStatus(1L, EvaluationTask.TaskStatus.QUEUED))
                .thenReturn(List.of(queuedTask));
        when(taskRepository.findByPlanIdAndStatus(1L, EvaluationTask.TaskStatus.PENDING))
                .thenReturn(List.of());
        when(taskRepository.findByPlanIdAndStatus(1L, EvaluationTask.TaskStatus.PAUSED))
                .thenReturn(List.of(pausedTask));

        planService.cancelPlan(1L);

        // GPU slots should be released for ALL tasks
        verify(gpuSlotService).releaseGpuSlots(100L);  // RUNNING
        verify(gpuSlotService).releaseGpuSlots(101L);  // DISPATCHED
        verify(gpuSlotService).releaseGpuSlots(102L);  // QUEUED
        verify(gpuSlotService).releaseGpuSlots(103L);  // PAUSED

        // All tasks should be CANCELLED
        assertEquals(EvaluationTask.TaskStatus.CANCELLED, runningTask.getStatus());
        assertEquals(EvaluationTask.TaskStatus.CANCELLED, dispatchedTask.getStatus());
        assertEquals(EvaluationTask.TaskStatus.CANCELLED, queuedTask.getStatus());
        assertEquals(EvaluationTask.TaskStatus.CANCELLED, pausedTask.getStatus());

        // Plan should be CANCELLED
        assertEquals(EvaluationPlan.PlanStatus.CANCELLED, plan.getStatus());
    }

    @Test
    @DisplayName("#499: cancelPlan GPU release failure doesn't block cancellation")
    void cancelPlan_gpuReleaseFailure_doesntBlock() {
        EvaluationPlan plan = makeRunningPlan(2L);
        EvaluationTask runningTask = makeTask(200L, EvaluationTask.TaskStatus.RUNNING);

        when(planRepository.findById(2L)).thenReturn(Optional.of(plan));
        when(planRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(taskRepository.findByPlanIdAndStatus(eq(2L), any())).thenReturn(List.of());
        when(taskRepository.findByPlanIdAndStatus(2L, EvaluationTask.TaskStatus.RUNNING))
                .thenReturn(List.of(runningTask));

        // GPU release throws exception
        doThrow(new RuntimeException("DB error")).when(gpuSlotService).releaseGpuSlots(200L);

        // Should NOT throw
        assertDoesNotThrow(() -> planService.cancelPlan(2L));

        // Task should still be cancelled despite GPU release failure
        assertEquals(EvaluationTask.TaskStatus.CANCELLED, runningTask.getStatus());
    }
}
