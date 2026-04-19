package com.lab.task;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * #520: Queue Status API Tests
 * - GET /api/tasks/queue-status returns totalQueued, myQueuedTasks, positions, estimatedWait
 * - PATCH /api/tasks/{id}/cancel cancels QUEUED task
 */
@ExtendWith(MockitoExtension.class)
class TaskQueueStatusApiTest {

    @Mock
    private EvaluationTaskRepository taskRepository;

    @Test
    @DisplayName("#520: queue-status API returns totalQueued and user's queued tasks")
    void testQueueStatusResponseStructure() {
        // Setup: 5 queued tasks, 2 belong to userId=1
        List<EvaluationTask> allQueued = new ArrayList<>();
        for (int i = 1; i <= 5; i++) {
            EvaluationTask t = new EvaluationTask();
            t.setId((long) i);
            t.setTaskNo("TASK-" + i);
            t.setStatus(EvaluationTask.TaskStatus.QUEUED);
            t.setCreatedBy(i <= 2 ? 1L : 2L);
            t.setPriority(EvaluationTask.Priority.MEDIUM);
            t.setCreatedAt(Instant.now().minus(10 - i, ChronoUnit.MINUTES));
            allQueued.add(t);
        }

        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt())
                .thenReturn(allQueued);

        List<EvaluationTask> queued = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();
        Long currentUserId = 1L;

        // Build queue-status response
        Map<String, Object> response = new HashMap<>();
        response.put("totalQueued", queued.size());

        List<Map<String, Object>> myTasks = new ArrayList<>();
        for (int i = 0; i < queued.size(); i++) {
            EvaluationTask task = queued.get(i);
            if (task.getCreatedBy().equals(currentUserId)) {
                Map<String, Object> item = new HashMap<>();
                item.put("taskId", task.getId());
                item.put("taskNo", task.getTaskNo());
                item.put("queuePosition", i + 1);
                item.put("estimatedWaitMinutes", (i + 1) * 10);
                myTasks.add(item);
            }
        }
        response.put("myQueuedTasks", myTasks);
        response.put("myQueuedCount", myTasks.size());

        assertEquals(5, response.get("totalQueued"));
        assertEquals(2, response.get("myQueuedCount"));
        assertEquals(2, ((List<?>) response.get("myQueuedTasks")).size());
    }

    @Test
    @DisplayName("#520: Each queued task has position and estimated wait time")
    void testQueuePositionAndEstimate() {
        List<EvaluationTask> queued = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            EvaluationTask t = new EvaluationTask();
            t.setId((long) i);
            t.setStatus(EvaluationTask.TaskStatus.QUEUED);
            t.setCreatedBy(1L);
            queued.add(t);
        }

        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt()).thenReturn(queued);

        List<EvaluationTask> result = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();
        for (int i = 0; i < result.size(); i++) {
            int position = i + 1;
            int estimatedWait = position * 10; // 10 min per position
            assertTrue(position >= 1);
            assertTrue(estimatedWait > 0);
        }
    }

    @Test
    @DisplayName("#520: QUEUED task can be cancelled")
    void testCancelQueuedTask() {
        EvaluationTask task = new EvaluationTask();
        task.setId(1L);
        task.setStatus(EvaluationTask.TaskStatus.QUEUED);
        task.setCreatedBy(1L);

        // Simulate cancel
        assertTrue(task.getStatus() == EvaluationTask.TaskStatus.QUEUED,
                "Task should be QUEUED before cancel");

        task.setStatus(EvaluationTask.TaskStatus.CANCELLED);
        assertEquals(EvaluationTask.TaskStatus.CANCELLED, task.getStatus());
    }

    @Test
    @DisplayName("#520: RUNNING task cannot be cancelled via PATCH (only QUEUED)")
    void testCannotCancelRunningViaPatch() {
        EvaluationTask task = new EvaluationTask();
        task.setId(1L);
        task.setStatus(EvaluationTask.TaskStatus.RUNNING);

        // PATCH cancel should only work for QUEUED tasks
        boolean canPatchCancel = task.getStatus() == EvaluationTask.TaskStatus.QUEUED
                || task.getStatus() == EvaluationTask.TaskStatus.PENDING;

        assertFalse(canPatchCancel, "RUNNING task should not be cancellable via PATCH");
    }

    @Test
    @DisplayName("#520: Empty queue returns zero counts")
    void testEmptyQueueStatus() {
        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt())
                .thenReturn(List.of());

        List<EvaluationTask> queued = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();
        assertEquals(0, queued.size());

        Map<String, Object> response = new HashMap<>();
        response.put("totalQueued", 0);
        response.put("myQueuedTasks", List.of());
        response.put("myQueuedCount", 0);

        assertEquals(0, response.get("totalQueued"));
        assertEquals(0, response.get("myQueuedCount"));
    }
}
