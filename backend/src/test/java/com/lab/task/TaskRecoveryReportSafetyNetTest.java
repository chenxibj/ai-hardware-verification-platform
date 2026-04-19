package com.lab.task;

import com.lab.chipreport.ChipReportRepository;
import com.lab.chipreport.ReportGeneratorService;
import com.lab.plan.EvaluationPlan;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.*;

/**
 * #508: Safety-net test — TaskRecoveryScheduler.completeFinishedPlans must
 * inject ChipReportRepository and ReportGeneratorService to provide
 * "double insurance" for report generation.
 *
 * When PlanProgressService.updateProgress fires PlanCompletedEvent and the
 * @TransactionalEventListener triggers report generation, the happy path works.
 * But as extra insurance, completeFinishedPlans() should also check for
 * COMPLETED plans that have no report and directly trigger report generation.
 */
class TaskRecoveryReportSafetyNetTest {

    @Test
    @DisplayName("#508: TaskRecoveryScheduler must have ChipReportRepository for double-insurance report check")
    void schedulerShouldHaveChipReportRepository() {
        boolean hasField = Arrays.stream(TaskRecoveryScheduler.class.getDeclaredFields())
                .anyMatch(f -> f.getType().equals(ChipReportRepository.class));
        assertTrue(hasField,
                "TaskRecoveryScheduler should inject ChipReportRepository " +
                "to check for COMPLETED plans missing reports (double insurance).");
    }

    @Test
    @DisplayName("#508: TaskRecoveryScheduler must have ReportGeneratorService for double-insurance report generation")
    void schedulerShouldHaveReportGeneratorService() {
        boolean hasField = Arrays.stream(TaskRecoveryScheduler.class.getDeclaredFields())
                .anyMatch(f -> f.getType().equals(ReportGeneratorService.class));
        assertTrue(hasField,
                "TaskRecoveryScheduler should inject ReportGeneratorService " +
                "to directly generate reports for COMPLETED plans that missed event-driven generation.");
    }
}
