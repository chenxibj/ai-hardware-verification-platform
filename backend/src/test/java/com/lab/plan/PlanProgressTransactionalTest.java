package com.lab.plan;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.*;

/**
 * #508: Verify PlanProgressService.updateProgress has @Transactional.
 *
 * Without @Transactional, when called from a non-transactional context
 * (e.g., TaskRecoveryScheduler → TaskLifecycleService.onTaskTerminated,
 * where Spring self-invocation bypasses the @Transactional proxy on
 * the scheduler's individual methods), the PlanCompletedEvent published
 * inside updateProgress has no transaction to synchronize with.
 * The @TransactionalEventListener(AFTER_COMMIT) in ReportGeneratorService
 * will silently NOT fire because there is no active transaction.
 *
 * Fix: Add @Transactional to updateProgress so it always runs within
 * a transaction, guaranteeing the AFTER_COMMIT listener fires.
 */
class PlanProgressTransactionalTest {

    @Test
    @DisplayName("#508: updateProgress must have @Transactional so AFTER_COMMIT event listeners fire")
    void updateProgress_shouldBeTransactional() throws NoSuchMethodException {
        Method method = PlanProgressService.class.getMethod("updateProgress", Long.class);
        assertTrue(method.isAnnotationPresent(Transactional.class),
                "updateProgress must have @Transactional annotation. " +
                "Without it, PlanCompletedEvent published inside updateProgress " +
                "won't trigger @TransactionalEventListener(AFTER_COMMIT) listeners " +
                "when called from non-transactional contexts " +
                "(e.g., TaskRecoveryScheduler self-invocation bypasses proxy).");
    }
}
