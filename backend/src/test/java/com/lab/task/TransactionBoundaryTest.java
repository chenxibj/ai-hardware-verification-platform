package com.lab.task;

import com.lab.chipreport.ReportGeneratorService;
import com.lab.node.ComputeNodeController;
import com.lab.plan.PlanCompletedEvent;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.*;

/**
 * #491: Transaction Boundary Optimization Tests
 * Verifies that:
 * 1. ReportGeneratorService.onPlanCompleted is @Async + @TransactionalEventListener(AFTER_COMMIT)
 * 2. ReportGeneratorService.generateReport has @Transactional(REQUIRES_NEW)
 * 3. pollTasks endpoint has @Transactional annotation
 */
class TransactionBoundaryTest {

    @Nested
    @DisplayName("#491-1: Report generation should be async and in independent transaction")
    class ReportGenerationAsync {

        @Test
        @DisplayName("onPlanCompleted should have @Async annotation")
        void onPlanCompleted_shouldBeAsync() throws NoSuchMethodException {
            Method method = ReportGeneratorService.class.getMethod("onPlanCompleted", PlanCompletedEvent.class);
            assertTrue(method.isAnnotationPresent(Async.class),
                    "onPlanCompleted should have @Async annotation for async report generation");
        }

        @Test
        @DisplayName("onPlanCompleted should use @TransactionalEventListener not @EventListener")
        void onPlanCompleted_shouldUseTransactionalEventListener() throws NoSuchMethodException {
            Method method = ReportGeneratorService.class.getMethod("onPlanCompleted", PlanCompletedEvent.class);
            assertTrue(method.isAnnotationPresent(TransactionalEventListener.class),
                    "onPlanCompleted should use @TransactionalEventListener for post-commit execution");

            TransactionalEventListener annotation = method.getAnnotation(TransactionalEventListener.class);
            assertEquals(org.springframework.transaction.event.TransactionPhase.AFTER_COMMIT,
                    annotation.phase(),
                    "Should run AFTER_COMMIT so report generation doesn't block submitResult");
        }

        @Test
        @DisplayName("onPlanCompleted should NOT have @Transactional (async method manages own tx)")
        void onPlanCompleted_shouldNotHaveTransactional() throws NoSuchMethodException {
            Method method = ReportGeneratorService.class.getMethod("onPlanCompleted", PlanCompletedEvent.class);
            // @Async + @TransactionalEventListener handles the tx boundary;
            // generateReport has its own @Transactional(REQUIRES_NEW)
            assertFalse(method.isAnnotationPresent(Transactional.class),
                    "onPlanCompleted should not have @Transactional; generateReport manages its own transaction");
        }

        @Test
        @DisplayName("generateReport should have @Transactional(REQUIRES_NEW)")
        void generateReport_shouldHaveRequiresNew() throws NoSuchMethodException {
            Method method = ReportGeneratorService.class.getMethod("generateReport", Long.class);
            assertTrue(method.isAnnotationPresent(Transactional.class),
                    "generateReport should have @Transactional");

            Transactional tx = method.getAnnotation(Transactional.class);
            assertEquals(org.springframework.transaction.annotation.Propagation.REQUIRES_NEW,
                    tx.propagation(),
                    "generateReport should use REQUIRES_NEW for independent transaction");
        }
    }

    @Nested
    @DisplayName("#491-3: pollTasks should have @Transactional")
    class PollTasksTransaction {

        @Test
        @DisplayName("pollTasks method should have @Transactional annotation")
        void pollTasks_shouldBeTransactional() throws NoSuchMethodException {
            Method method = ComputeNodeController.class.getMethod("pollTasks", Long.class, java.util.Map.class);
            assertTrue(method.isAnnotationPresent(Transactional.class),
                    "pollTasks should have @Transactional to ensure atomic DISPATCHED->RUNNING transition");
        }
    }
}
