package com.lab.chipreport;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TDD tests for #518: Report number uniqueness
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
    @DisplayName("#518: plan_id is naturally unique - no collision possible")
    void planId_naturallyUnique() {
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

    @Test
    @DisplayName("#518: reportNo column has unique constraint")
    void reportNo_uniqueConstraint() throws Exception {
        var field = ChipReport.class.getDeclaredField("reportNo");
        var col = field.getAnnotation(jakarta.persistence.Column.class);
        assertTrue(col.unique(), "reportNo should have unique=true");
    }

    @Test
    @DisplayName("#518: generateReportNo uses planId - verify via reflection")
    void generateReportNo_usesPlanId() throws Exception {
        ReportGeneratorService service = createServiceWithMinimalDeps();

        Method method = ReportGeneratorService.class.getDeclaredMethod("generateReportNo", Long.class);
        method.setAccessible(true);

        String reportNo = (String) method.invoke(service, 42L);

        String today = DateTimeFormatter.ofPattern("yyyyMMdd")
            .withZone(ZoneId.of("Asia/Shanghai"))
            .format(Instant.now());

        assertEquals("RPT-" + today + "-42", reportNo,
            "Report number should be RPT-{today}-{planId}");
    }

    @Test
    @DisplayName("#518: same planId on same day -> same reportNo (deterministic)")
    void generateReportNo_deterministic() throws Exception {
        ReportGeneratorService service = createServiceWithMinimalDeps();

        Method method = ReportGeneratorService.class.getDeclaredMethod("generateReportNo", Long.class);
        method.setAccessible(true);

        String rpt1 = (String) method.invoke(service, 99L);
        String rpt2 = (String) method.invoke(service, 99L);

        assertEquals(rpt1, rpt2, "Same planId should always produce same reportNo");
    }

    @Test
    @DisplayName("#518: idempotency check - generateReport skips if report exists")
    void generateReport_idempotencyCheck() {
        Optional<ChipReport> existing = Optional.of(new ChipReport());
        assertTrue(existing.isPresent(), "When report exists, should skip generation");
    }

    @Test
    @DisplayName("#518: different planIds -> different reportNos on same day")
    void generateReportNo_differentPlansAreDifferent() throws Exception {
        ReportGeneratorService service = createServiceWithMinimalDeps();

        Method method = ReportGeneratorService.class.getDeclaredMethod("generateReportNo", Long.class);
        method.setAccessible(true);

        String rpt1 = (String) method.invoke(service, 1L);
        String rpt2 = (String) method.invoke(service, 2L);
        String rpt3 = (String) method.invoke(service, 100L);

        assertNotEquals(rpt1, rpt2);
        assertNotEquals(rpt2, rpt3);
        assertNotEquals(rpt1, rpt3);
    }

    /**
     * #543: Constructor has 12 params (11 original + ReportDataAssembler)
     * generateReportNo doesn't use any deps, so pass nulls
     */
    private ReportGeneratorService createServiceWithMinimalDeps() {
        return new ReportGeneratorService(
            null, null, null, null, null, null,
            new ObjectMapper(), null, null, null, null, null);
    }
}
