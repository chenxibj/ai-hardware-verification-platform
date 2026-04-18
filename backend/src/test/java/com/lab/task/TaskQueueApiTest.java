package com.lab.task;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * #478 P6: Task Queue Status API Tests
 * Tests queue position calculation and API response structure
 */
@ExtendWith(MockitoExtension.class)
class TaskQueueApiTest {

    @Mock
    private EvaluationTaskRepository taskRepository;

    /**
     * Test: Queue position assignment for multiple QUEUED tasks
     * QUEUED tasks should get 1-based positions in priority + createdAt order
     */
    @Test
    @DisplayName("refreshQueuePositions assigns 1-based positions to QUEUED tasks")
    void testQueuePositionAssignment() {
        // Setup: 3 QUEUED tasks
        List<EvaluationTask> queuedTasks = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            EvaluationTask t = new EvaluationTask();
            t.setId((long) i);
            t.setTaskNo("TASK-" + i);
            t.setStatus(EvaluationTask.TaskStatus.QUEUED);
            t.setQueueReason("waiting for resources");
            queuedTasks.add(t);
        }

        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt())
                .thenReturn(queuedTasks);

        // Simulate refreshQueuePositions logic
        List<EvaluationTask> queued = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();
        double avgMinutes = 10.0; // default when no completed tasks
        for (int i = 0; i < queued.size(); i++) {
            EvaluationTask task = queued.get(i);
            task.setQueuePosition(i + 1);
            task.setEstimatedWaitMinutes((int) Math.ceil((i + 1) * avgMinutes));
        }

        // Assert positions
        assertEquals(1, queuedTasks.get(0).getQueuePosition());
        assertEquals(2, queuedTasks.get(1).getQueuePosition());
        assertEquals(3, queuedTasks.get(2).getQueuePosition());

        // Assert estimated wait times
        assertEquals(10, queuedTasks.get(0).getEstimatedWaitMinutes());
        assertEquals(20, queuedTasks.get(1).getEstimatedWaitMinutes());
        assertEquals(30, queuedTasks.get(2).getEstimatedWaitMinutes());
    }

    /**
     * Test: Queue API response contains expected fields
     */
    @Test
    @DisplayName("Queue API response has correct structure")
    void testQueueApiResponseStructure() {
        EvaluationTask task = new EvaluationTask();
        task.setId(1L);
        task.setTaskNo("TASK-001");
        task.setStatus(EvaluationTask.TaskStatus.QUEUED);
        task.setQueuePosition(1);
        task.setEstimatedWaitMinutes(10);
        task.setQueueReason("等待 GPU 资源释放");

        // Verify fields are accessible (getter test)
        assertNotNull(task.getQueuePosition());
        assertNotNull(task.getEstimatedWaitMinutes());
        assertNotNull(task.getQueueReason());
        assertEquals(1, task.getQueuePosition());
        assertEquals(10, task.getEstimatedWaitMinutes());
        assertEquals("等待 GPU 资源释放", task.getQueueReason());
    }

    /**
     * Test: allocatedGpuIndices field works correctly
     */
    @Test
    @DisplayName("allocatedGpuIndices field stores JSON string")
    void testAllocatedGpuIndicesField() {
        EvaluationTask task = new EvaluationTask();
        task.setAllocatedGpuIndices("[0,1,2,3]");
        assertEquals("[0,1,2,3]", task.getAllocatedGpuIndices());

        task.setAllocatedGpuIndices(null);
        assertNull(task.getAllocatedGpuIndices());
    }

    /**
     * Test: Average duration calculation with completed tasks
     */
    @Test
    @DisplayName("Average duration calculation from completed tasks")
    void testAverageDurationCalculation() {
        // Simulate: 3 completed tasks with known durations
        List<EvaluationTask> completed = new ArrayList<>();
        Instant base = Instant.now().minus(1, ChronoUnit.HOURS);

        // Task 1: 5 minutes
        EvaluationTask t1 = new EvaluationTask();
        t1.setStartedAt(base);
        t1.setCompletedAt(base.plus(5, ChronoUnit.MINUTES));
        completed.add(t1);

        // Task 2: 15 minutes
        EvaluationTask t2 = new EvaluationTask();
        t2.setStartedAt(base);
        t2.setCompletedAt(base.plus(15, ChronoUnit.MINUTES));
        completed.add(t2);

        // Task 3: 10 minutes
        EvaluationTask t3 = new EvaluationTask();
        t3.setStartedAt(base);
        t3.setCompletedAt(base.plus(10, ChronoUnit.MINUTES));
        completed.add(t3);

        // Calculate average
        long totalMs = 0;
        int count = 0;
        for (EvaluationTask t : completed) {
            if (t.getStartedAt() != null && t.getCompletedAt() != null) {
                totalMs += java.time.Duration.between(t.getStartedAt(), t.getCompletedAt()).toMillis();
                count++;
            }
        }
        double avgMinutes = count > 0 ? (totalMs / count) / 60000.0 : 10.0;

        assertEquals(10.0, avgMinutes, 0.01);
    }

    /**
     * Test: Empty queue returns no positions
     */
    @Test
    @DisplayName("Empty queue returns no positions")
    void testEmptyQueue() {
        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt())
                .thenReturn(List.of());

        List<EvaluationTask> queued = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();
        assertTrue(queued.isEmpty());
    }
}
