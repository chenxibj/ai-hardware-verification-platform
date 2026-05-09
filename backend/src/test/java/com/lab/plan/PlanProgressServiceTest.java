package com.lab.plan;

import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * #490: PlanProgressService — 统一 Plan 进度统计测试
 */
@ExtendWith(MockitoExtension.class)
class PlanProgressServiceTest {

    @Mock private EvaluationPlanRepository planRepository;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private ApplicationEventPublisher eventPublisher;
    @Mock private ChipRepository chipRepository;

    @InjectMocks
    private PlanProgressService planProgressService;

    private EvaluationPlan plan;

    @BeforeEach
    void setUp() {
        plan = new EvaluationPlan();
        plan.setId(1L);
        plan.setPlanNo("PLAN-001");
        plan.setStatus(EvaluationPlan.PlanStatus.RUNNING);
        plan.setTotalTasks(3);
        plan.setChipId(10L);
    }

    @Test
    void allCompleted_planCompleted_progress100() {
        when(planRepository.findById(1L)).thenReturn(Optional.of(plan));
        when(taskRepository.findByPlanId(1L)).thenReturn(List.of(
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED),
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED),
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED)
        ));

        planProgressService.updateProgress(1L);

        ArgumentCaptor<EvaluationPlan> captor = ArgumentCaptor.forClass(EvaluationPlan.class);
        verify(planRepository).save(captor.capture());
        EvaluationPlan saved = captor.getValue();
        assertEquals(100, saved.getProgress());
        assertEquals(3, saved.getCompletedTasks());
        assertEquals(EvaluationPlan.PlanStatus.COMPLETED, saved.getStatus());
        assertNotNull(saved.getCompletedAt());
    }

    @Test
    void mixedTerminal_correctProgressAndStatus() {
        when(planRepository.findById(1L)).thenReturn(Optional.of(plan));
        when(taskRepository.findByPlanId(1L)).thenReturn(List.of(
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED),
                taskWithStatus(EvaluationTask.TaskStatus.FAILED),
                taskWithStatus(EvaluationTask.TaskStatus.CANCELLED)
        ));

        planProgressService.updateProgress(1L);

        ArgumentCaptor<EvaluationPlan> captor = ArgumentCaptor.forClass(EvaluationPlan.class);
        verify(planRepository).save(captor.capture());
        EvaluationPlan saved = captor.getValue();
        assertEquals(100, saved.getProgress());
        assertEquals(3, saved.getCompletedTasks());
        assertEquals(EvaluationPlan.PlanStatus.COMPLETED, saved.getStatus());
    }

    @Test
    void allFailed_planFailed() {
        when(planRepository.findById(1L)).thenReturn(Optional.of(plan));
        when(taskRepository.findByPlanId(1L)).thenReturn(List.of(
                taskWithStatus(EvaluationTask.TaskStatus.FAILED),
                taskWithStatus(EvaluationTask.TaskStatus.FAILED),
                taskWithStatus(EvaluationTask.TaskStatus.FAILED)
        ));

        planProgressService.updateProgress(1L);

        ArgumentCaptor<EvaluationPlan> captor = ArgumentCaptor.forClass(EvaluationPlan.class);
        verify(planRepository).save(captor.capture());
        EvaluationPlan saved = captor.getValue();
        assertEquals(EvaluationPlan.PlanStatus.FAILED, saved.getStatus());
        assertEquals(100, saved.getProgress());
    }

    @Test
    void partiallyDone_planStaysRunning() {
        when(planRepository.findById(1L)).thenReturn(Optional.of(plan));
        when(taskRepository.findByPlanId(1L)).thenReturn(List.of(
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED),
                taskWithStatus(EvaluationTask.TaskStatus.RUNNING),
                taskWithStatus(EvaluationTask.TaskStatus.QUEUED)
        ));

        planProgressService.updateProgress(1L);

        ArgumentCaptor<EvaluationPlan> captor = ArgumentCaptor.forClass(EvaluationPlan.class);
        verify(planRepository).save(captor.capture());
        EvaluationPlan saved = captor.getValue();
        assertEquals(33, saved.getProgress());
        assertEquals(1, saved.getCompletedTasks());
        assertEquals(EvaluationPlan.PlanStatus.RUNNING, saved.getStatus());
    }

    @Test
    void nullPlanId_noop() {
        planProgressService.updateProgress(null);
        verifyNoInteractions(planRepository, taskRepository);
    }

    @Test
    void planNotFound_noop() {
        when(planRepository.findById(999L)).thenReturn(Optional.empty());
        planProgressService.updateProgress(999L);
        verify(planRepository, never()).save(any());
    }

    @Test
    void skippedCountsAsTerminal() {
        when(planRepository.findById(1L)).thenReturn(Optional.of(plan));
        when(taskRepository.findByPlanId(1L)).thenReturn(List.of(
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED),
                taskWithStatus(EvaluationTask.TaskStatus.SKIPPED),
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED)
        ));

        planProgressService.updateProgress(1L);

        ArgumentCaptor<EvaluationPlan> captor = ArgumentCaptor.forClass(EvaluationPlan.class);
        verify(planRepository).save(captor.capture());
        assertEquals(EvaluationPlan.PlanStatus.COMPLETED, captor.getValue().getStatus());
        assertEquals(100, captor.getValue().getProgress());
    }

    @Test
    void allTerminal_publishesPlanCompletedEvent() {
        when(planRepository.findById(1L)).thenReturn(Optional.of(plan));
        when(taskRepository.findByPlanId(1L)).thenReturn(List.of(
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED),
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED),
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED)
        ));

        planProgressService.updateProgress(1L);

        verify(eventPublisher).publishEvent(any(PlanCompletedEvent.class));
    }

    @Test
    void partiallyDone_doesNotPublishEvent() {
        when(planRepository.findById(1L)).thenReturn(Optional.of(plan));
        when(taskRepository.findByPlanId(1L)).thenReturn(List.of(
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED),
                taskWithStatus(EvaluationTask.TaskStatus.RUNNING)
        ));

        planProgressService.updateProgress(1L);

        verify(eventPublisher, never()).publishEvent(any());
    }

    // All FAILED + CANCELLED (no COMPLETED) → FAILED
    @Test
    void allFailedAndCancelled_noCompleted_planFailed() {
        when(planRepository.findById(1L)).thenReturn(Optional.of(plan));
        when(taskRepository.findByPlanId(1L)).thenReturn(List.of(
                taskWithStatus(EvaluationTask.TaskStatus.FAILED),
                taskWithStatus(EvaluationTask.TaskStatus.CANCELLED),
                taskWithStatus(EvaluationTask.TaskStatus.FAILED)
        ));

        planProgressService.updateProgress(1L);

        ArgumentCaptor<EvaluationPlan> captor = ArgumentCaptor.forClass(EvaluationPlan.class);
        verify(planRepository).save(captor.capture());
        // No COMPLETED tasks → all terminal but none succeeded → FAILED
        assertEquals(EvaluationPlan.PlanStatus.FAILED, captor.getValue().getStatus());
    }

    private EvaluationTask taskWithStatus(EvaluationTask.TaskStatus status) {
        EvaluationTask task = new EvaluationTask();
        task.setStatus(status);
        return task;
    }

    @Test
    void allCompleted_chipStatusUpdatedToEvaluated() {
        Chip chip = new Chip();
        chip.setId(10L);
        chip.setChipNo("CHIP-001");
        chip.setStatus(Chip.ChipStatus.EVALUATING);
        when(chipRepository.findById(10L)).thenReturn(Optional.of(chip));
        when(planRepository.findById(1L)).thenReturn(Optional.of(plan));
        when(taskRepository.findByPlanId(1L)).thenReturn(List.of(
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED),
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED),
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED)
        ));

        planProgressService.updateProgress(1L);

        assertEquals(Chip.ChipStatus.EVALUATED, chip.getStatus());
        verify(chipRepository).save(chip);
    }

    @Test
    void partiallyDone_chipStatusNotChanged() {
        when(planRepository.findById(1L)).thenReturn(Optional.of(plan));
        when(taskRepository.findByPlanId(1L)).thenReturn(List.of(
                taskWithStatus(EvaluationTask.TaskStatus.COMPLETED),
                taskWithStatus(EvaluationTask.TaskStatus.RUNNING)
        ));

        planProgressService.updateProgress(1L);

        verify(chipRepository, never()).findById(any());
    }

}
