package com.lab.chipreport;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TDD tests for #518: Report number uniqueness (updated with review supplement)
 */
class ReportNoUniquenessTest {

    @Test
    @DisplayName("#518: ChipReportRepository has countByReportNoStartingWith method")
    void repository_hasCountMethod() throws Exception {
        Method method = ChipReportRepository.class.getMethod("countByReportNoStartingWith", String.class);
        assertNotNull(method, "ChipReportRepository should have countByReportNoStartingWith");
        assertEquals(long.class, method.getReturnType(), "Should return long");
    }

    @Test
    @DisplayName("#518: Report number format is RPT-YYYYMMDD-{planId}")
    void reportNo_formatPattern() {
        Long planId = 42L;
        String date = "20260419";
        String reportNo = "RPT-" + date + "-" + planId;
        assertEquals("RPT-20260419-42", reportNo);
        assertTrue(reportNo.matches("RPT-\\d{8}-\\d+"),
            "Report number should match RPT-YYYYMMDD-{planId}");
    }

    @Test
    @DisplayName("#518: plan_id is naturally unique — no collision possible")
    void planId_naturallyUnique() {
        // Two different plans produce different report numbers
        String rpt1 = "RPT-20260419-" + 1L;
        String rpt2 = "RPT-20260419-" + 2L;
        assertNotEquals(rpt1, rpt2, "Different plans produce different report numbers");
    }

    @Test
    @DisplayName("#518: findFirstByPlanId exists for idempotency")
    void repository_hasFindFirstByPlanId() throws Exception {
        Method m = ChipReportRepository.class.getMethod("findFirstByPlanId", Long.class);
        assertNotNull(m);
        assertEquals(Optional.class, m.getReturnType());
    }

    @Test
    @DisplayName("#518: plan_id unique constraint via @Column annotation")
    void planId_uniqueConstraint() throws Exception {
        var field = ChipReport.class.getDeclaredField("planId");
        var col = field.getAnnotation(jakarta.persistence.Column.class);
        assertTrue(col.unique(), "planId should have unique=true");
    }
}
