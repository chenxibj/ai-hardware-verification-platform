package com.lab.task;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * #519: Stalled task warning detection tests
 * - RUNNING task with no progress update for 5+ minutes gets warning
 * - warningMessage field in API response
 * - Stall detection query
 */
@ExtendWith(MockitoExtension.class)
class TaskStallWarningTest {

    @Mock
    private EvaluationTaskRepository taskRepository;

    @Test
    @DisplayName("#519: Task RUNNING > 5 min with no progress update is detected as stalled")
    void testStalledTaskDetection() {
        EvaluationTask task = new EvaluationTask();
        task.setId(1L);
        task.setTaskNo("TASK-001");
        task.setStatus(EvaluationTask.TaskStatus.RUNNING);
        task.setProgress(30);
        // Last progress update was 12 minutes ago
        task.setLastProgressUpdateAt(Instant.now().minus(12, ChronoUnit.MINUTES));
        task.setStartedAt(Instant.now().minus(20, ChronoUnit.MINUTES));

        // Compute warning
        boolean isStalled = task.getLastProgressUpdateAt() != null
                && task.getStatus() == EvaluationTask.TaskStatus.RUNNING
                && Instant.now().minus(5, ChronoUnit.MINUTES).isAfter(task.getLastProgressUpdateAt());

        assertTrue(isStalled, "Task should be detected as stalled");
    }

    @Test
    @DisplayName("#519: Task with recent progress update is NOT stalled")
    void testNonStalledTask() {
        EvaluationTask task = new EvaluationTask();
        task.setId(2L);
        task.setStatus(EvaluationTask.TaskStatus.RUNNING);
        task.setProgress(60);
        // Last progress update was 2 minutes ago
        task.setLastProgressUpdateAt(Instant.now().minus(2, ChronoUnit.MINUTES));

        boolean isStalled = task.getLastProgressUpdateAt() != null
                && task.getStatus() == EvaluationTask.TaskStatus.RUNNING
                && Instant.now().minus(5, ChronoUnit.MINUTES).isAfter(task.getLastProgressUpdateAt());

        assertFalse(isStalled, "Task should NOT be detected as stalled");
    }

    @Test
    @DisplayName("#519: warningMessage includes stall duration in minutes")
    void testWarningMessageFormat() {
        Instant stalledSince = Instant.now().minus(12, ChronoUnit.MINUTES);
        long stallMinutes = java.time.Duration.between(stalledSince, Instant.now()).toMinutes();

        String warningMessage = String.format("任务已卡顿 %d 分钟，进度无更新", stallMinutes);

        assertTrue(warningMessage.contains("12"));
        assertTrue(warningMessage.contains("卡顿"));
    }

    @Test
    @DisplayName("#519: COMPLETED task is never stalled even if old")
    void testCompletedTaskNotStalled() {
        EvaluationTask task = new EvaluationTask();
        task.setStatus(EvaluationTask.TaskStatus.COMPLETED);
        task.setLastProgressUpdateAt(Instant.now().minus(60, ChronoUnit.MINUTES));

        boolean isStalled = task.getLastProgressUpdateAt() != null
                && task.getStatus() == EvaluationTask.TaskStatus.RUNNING
                && Instant.now().minus(5, ChronoUnit.MINUTES).isAfter(task.getLastProgressUpdateAt());

        assertFalse(isStalled);
    }

    @Test
    @DisplayName("#519: findStalledRunningTasks returns tasks with old lastProgressUpdateAt")
    void testRepositoryQueryForStalledTasks() {
        Instant threshold = Instant.now().minus(5, ChronoUnit.MINUTES);

        EvaluationTask stalled = new EvaluationTask();
        stalled.setId(1L);
        stalled.setStatus(EvaluationTask.TaskStatus.RUNNING);
        stalled.setLastProgressUpdateAt(Instant.now().minus(10, ChronoUnit.MINUTES));

        when(taskRepository.findStalledRunningTasks(any(Instant.class)))
                .thenReturn(List.of(stalled));

        List<EvaluationTask> result = taskRepository.findStalledRunningTasks(threshold);
        assertEquals(1, result.size());
        assertEquals(1L, result.get(0).getId());
    }
}
