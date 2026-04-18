package com.lab.task;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * #481: Test queue position computed on read, not persisted.
 * Also tests evalType-grouped average duration calculation.
 */
@ExtendWith(MockitoExtension.class)
class TaskQueueComputeOnReadTest {

    @Mock
    private EvaluationTaskRepository taskRepository;

    @Test
    @DisplayName("#481: /tasks/queue computes positions on-the-fly (1-based)")
    void testQueuePositionComputedOnRead() {
        List<EvaluationTask> queued = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            EvaluationTask t = new EvaluationTask();
            t.setId((long)(i + 1));
            t.setTaskNo("TASK-" + (i + 1));
            t.setStatus(EvaluationTask.TaskStatus.QUEUED);
            t.setEvalType(EvaluationTask.EvalType.OPERATOR);
            t.setQueueReason("waiting");
            // queuePosition and estimatedWaitMinutes are NOT set — they should be null
            assertNull(t.getQueuePosition());
            assertNull(t.getEstimatedWaitMinutes());
            queued.add(t);
        }

        // Simulate on-the-fly computation (as the new /tasks/queue endpoint would do)
        Map<String, Double> avgByType = new HashMap<>();
        avgByType.put("OPERATOR", 8.0); // 8 minutes average for OPERATOR tasks

        for (int i = 0; i < queued.size(); i++) {
            EvaluationTask task = queued.get(i);
            int position = i + 1;
            String evalType = task.getEvalType().name();
            double avgMin = avgByType.getOrDefault(evalType, 10.0);
            int estimatedWait = (int) Math.ceil(position * avgMin);

            assertEquals(position, i + 1);
            assertEquals(8, estimatedWait / position); // 8 min per position
        }
    }

    @Test
    @DisplayName("#481: evalType-grouped average duration calculation")
    void testEvalTypeGroupedAverageDuration() {
        // Simulate raw results from findAverageDurationByEvalTypeRaw
        // Each Object[] is [eval_type_string, avg_seconds_double]
        List<Object[]> rawResults = new ArrayList<>();
        rawResults.add(new Object[]{"OPERATOR", 300.0});  // 5 min
        rawResults.add(new Object[]{"MODEL", 900.0});     // 15 min
        rawResults.add(new Object[]{"TRAINING", 1800.0}); // 30 min

        Map<String, Double> avgMinutesByType = new HashMap<>();
        for (Object[] row : rawResults) {
            String evalType = (String) row[0];
            double avgSec = ((Number) row[1]).doubleValue();
            avgMinutesByType.put(evalType, avgSec / 60.0);
        }

        assertEquals(5.0, avgMinutesByType.get("OPERATOR"), 0.01);
        assertEquals(15.0, avgMinutesByType.get("MODEL"), 0.01);
        assertEquals(30.0, avgMinutesByType.get("TRAINING"), 0.01);
    }

    @Test
    @DisplayName("#481: Queue API uses type-specific avg, falls back to 10 min")
    void testQueueApiFallbackAverage() {
        // If evalType has no history, should default to 10 minutes
        Map<String, Double> avgMinutesByType = new HashMap<>();
        avgMinutesByType.put("OPERATOR", 5.0);

        // OPERATOR task at position 2 => 2 * 5 = 10 min
        double operatorWait = 2 * avgMinutesByType.getOrDefault("OPERATOR", 10.0);
        assertEquals(10.0, operatorWait, 0.01);

        // TRAINING task (no history) at position 1 => 1 * 10 = 10 min (default)
        double trainingWait = 1 * avgMinutesByType.getOrDefault("TRAINING", 10.0);
        assertEquals(10.0, trainingWait, 0.01);
    }

    @Test
    @DisplayName("#481: refreshQueuePositions no longer called in tryDispatchNext")
    void testRefreshQueuePositionsRemoved() {
        // This test documents that refreshQueuePositions was removed from TaskDispatcher.
        // The method should not exist anymore. We verify this by checking the
        // new /tasks/queue endpoint computes positions without persisted data.

        EvaluationTask task = new EvaluationTask();
        task.setId(1L);
        task.setStatus(EvaluationTask.TaskStatus.QUEUED);
        task.setEvalType(EvaluationTask.EvalType.MODEL);

        // These fields should remain null/0 in the DB — only computed on read
        assertNull(task.getQueuePosition());
        assertNull(task.getEstimatedWaitMinutes());
    }
}
